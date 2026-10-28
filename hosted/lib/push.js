import {buildPushPayload} from '@block65/webcrypto-web-push';
import {createHash,randomUUID} from 'node:crypto';
import {change,load} from './store';
const digest=s=>createHash('sha256').update(s).digest('hex');
export const pushConfig=env=>({enabled:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),publicKey:env.VAPID_PUBLIC_KEY||null});
function validate(sub){
 const u=new URL(sub?.endpoint||'');
 const hosts=['fcm.googleapis.com','push.services.mozilla.com','push.apple.com','notify.windows.com','wns.windows.com'];
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('This browser push service is not supported.');
 if(Buffer.from(sub.keys?.p256dh||'','base64url').length!==65||Buffer.from(sub.keys?.auth||'','base64url').length!==16)throw Error('Invalid browser notification keys.');
 return {endpoint:u.href,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth},expirationTime:null};
}
export async function subscribe(env,id,input){
 if(!pushConfig(env).enabled)throw Error('Phone alerts are not configured yet.');const subscription=validate(input);
 await change(env.DB,c=>{const b=c.find(id);c.state.pushSubscriptions??=[];const key=digest(id+subscription.endpoint);if(!c.state.pushSubscriptions.some(s=>s.id===key)&&c.state.pushSubscriptions.filter(s=>s.bookingId===id).length>=5)throw Error('This appointment already has five notification devices.');c.state.pushSubscriptions=c.state.pushSubscriptions.filter(s=>s.id!==key);c.state.pushSubscriptions.push({id:key,bookingId:id,subscription,created:Date.now()});c.event('push.enabled',`${b.token}: phone alerts enabled. Consultation ${b.scheduledAt?new Date(b.scheduledAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'})+' PKT':'time will be updated by reception'}.`,id);});
 await flushPush(env);
}
export async function flushPush(env){
 if(!pushConfig(env).enabled)return;
 const current=await load(env.DB),now=Date.now();if(!(current.clinic.state.mobileOutbox||[]).length&&!(current.clinic.state.pushJobs||[]).some(j=>(j.status==='Pending'||j.status==='Sending'&&j.leaseUntil<now)&&j.nextAttempt<=now))return;const owner=randomUUID();
 const claim=await change(env.DB,c=>{
  c.state.pushJobs??=[];const subs=c.state.pushSubscriptions||[];
  for(const e of c.state.mobileOutbox||[])for(const s of subs.filter(s=>s.bookingId===e.bookingId)){const id=digest(e.id+s.id);if(!c.state.pushJobs.some(j=>j.id===id))c.state.pushJobs.push({id,subscriptionId:s.id,bookingId:e.bookingId,body:e.text,eventType:e.type,scheduledAt:e.scheduledAt,created:now,attempts:0,status:'Pending',nextAttempt:now});}
  c.state.mobileOutbox=[];
  // Keep pending jobs and a short delivery history, never patient phone/address in payloads.
  c.state.pushJobs=c.state.pushJobs.filter(j=>['Pending','Sending'].includes(j.status)||j.created>now-7*86400000).slice(-1500);
  const jobs=c.state.pushJobs.filter(j=>(j.status==='Pending'||(j.status==='Sending'&&j.leaseUntil<now))&&j.nextAttempt<=now).slice(0,25);
  for(const j of jobs){j.status='Sending';j.owner=owner;j.leaseUntil=now+60000;j.attempts++;}
  return jobs.map(j=>({...j,subscription:subs.find(s=>s.id===j.subscriptionId)?.subscription}));
 });
 for(const j of claim.result){let status='Sent',error=null,remove=false;
  try{const latest=(await load(env.DB)).clinic.find(j.bookingId);if(['arrival.reminder','schedule.changed','doctor.notice','booking.confirmed'].includes(j.eventType)&&(['Cancelled','Absent','Completed'].includes(latest.status)||j.scheduledAt&&latest.scheduledAt!==j.scheduledAt)){await change(env.DB,c=>{const row=c.state.pushJobs.find(x=>x.id===j.id&&x.owner===owner);if(row)row.status='Superseded';});continue;}if(!j.subscription){status='Failed';throw Error('Device subscription removed.');}
   const init=await buildPushPayload({data:{title:'ClinicFlow appointment update',body:j.body,url:(env.CLINIC_BASE||'')+'/#booking='+j.bookingId,tag:j.id},options:{ttl:900,urgency:'high'}},j.subscription,{subject:'https://wmp-clinicflow.wmpsolution.chatgpt.site',publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
   const r=await fetch(j.subscription.endpoint,{...init,signal:AbortSignal.timeout(10000)});if(!r.ok){remove=[404,410].includes(r.status);throw Error('Push service returned '+r.status);}
  }catch(e){error=String(e.message).slice(0,180);status=remove||j.attempts>=5||!j.subscription?'Failed':'Pending';}
  await change(env.DB,c=>{const row=c.state.pushJobs?.find(x=>x.id===j.id&&x.owner===owner);if(!row)return;Object.assign(row,{status,error,sentAt:status==='Sent'?Date.now():null,nextAttempt:Date.now()+Math.min(15,2**j.attempts)*60000});if(remove)c.state.pushSubscriptions=c.state.pushSubscriptions.filter(s=>s.id!==j.subscriptionId);});
 }
}
export function pushStatus(c,id){const jobs=(c.state.pushJobs||[]).filter(j=>!id||j.bookingId===id);return {devices:(c.state.pushSubscriptions||[]).filter(s=>!id||s.bookingId===id).length,sent:jobs.filter(j=>j.status==='Sent').length,pending:jobs.filter(j=>['Pending','Sending'].includes(j.status)).length,failed:jobs.filter(j=>j.status==='Failed').length};}
