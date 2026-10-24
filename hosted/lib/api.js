import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {load,change,expire} from './store';
import {today,addDays,validDate} from './clinic-domain';
import {status,publish,eventStream,ask} from './notifier';
import {pushConfig,subscribe,flushPush,pushStatus} from './push';
import {makeReport} from './reports.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json=(code,data,headers={})=>Response.json(data,{status:code,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
async function auth(req,env){const token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('clinic_staff='))?.slice(13);if(!token)return false;return !!await env.DB.prepare('SELECT token FROM staff_sessions WHERE token=? AND expires>?').bind(hash(token),Date.now()).first();}
async function staff(req,env){if(!await auth(req,env))throw Object.assign(Error('Please sign in to reception.'),{status:401});}
function patient(req,c,id){const b=c.find(id);if(!same(req.headers.get('x-patient-key'),b.access))throw Object.assign(Error('Private booking access required.'),{status:403});return b;}
async function rate(req,env,action,max){const k=hash((req.headers.get('cf-connecting-ip')||'preview')+':'+action),now=Date.now();await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN ? ELSE expires END').bind(k,now+60000,now,now,now+60000).run();const r=await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(k).first();if(r.count>max)throw Object.assign(Error('Too many requests. Please wait one minute.'),{status:429});}
async function data(req){const text=await req.text();if(text.length>16000)throw Error('Request is too large.');return text?JSON.parse(text):{};}
async function summary(env,c){return {today:today(),settings:c.state.settings,dnotifier:{...await status(env),pending:c.state.outbox.length},serverTime:Date.now(),lastClockTick:c.state.lastClockTick||null,hosted:true};}
export async function handle(req,env){
 try{
  if(!env.DB)return json(503,{error:'Clinic database is not ready. Please try again after deployment finishes.'});
  const url=new URL(req.url),p=url.pathname.replace(/^\/api/,'');
  if(req.method==='POST'&&req.headers.get('origin')&&req.headers.get('origin')!==url.origin)throw Object.assign(Error('Cross-origin request denied.'),{status:403});
  if(p==='/events'&&req.method==='GET'){await rate(req,env,'events',20);return eventStream(req,env);}
  await expire(env.DB);await flushPush(env);let {clinic:c}=await load(env.DB);
  if((p==='/reports'||p==='/reports/pdf')&&req.method==='GET'){
   await staff(req,env);
   const report=makeReport(c,{from:url.searchParams.get('from'),to:url.searchParams.get('to'),status:url.searchParams.get('status')});
   if(p==='/reports')return json(200,report);
   await rate(req,env,'pdf-report',8);
   const {makeReportPdf,reportFonts}=await import('./report-pdf.js');
   const bytes=await makeReportPdf(report,await reportFonts(url.origin));
   return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="clinicflow-report-${report.from}-to-${report.to}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }
  if(p==='/push-config')return json(200,pushConfig(env));
  if(p==='/public')return json(200,await summary(env,c));
  if(p==='/availability'){const date=url.searchParams.get('date');if(!validDate(date)||date<today()||date>addDays(today(),89))throw Error('Invalid booking date.');return json(200,{...c.availability(date),suggestedDate:c.nextDate(date)});}
  if(p==='/login'&&req.method==='POST'){await rate(req,env,'login',8);const b=await data(req);if(!env.STAFF_PASSWORD||!same(String(b.password||''),env.STAFF_PASSWORD))throw Object.assign(Error('Incorrect reception password.'),{status:401});const token=randomBytes(32).toString('hex');await env.DB.prepare('INSERT INTO staff_sessions(token,expires) VALUES(?,?)').bind(hash(token),Date.now()+43200000).run();return json(200,{ok:true},{'Set-Cookie':`clinic_staff=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${url.protocol==='https:'?'; Secure':''}`});}
  if(p==='/logout'&&req.method==='POST'){const token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('clinic_staff='))?.slice(13);if(token)await env.DB.prepare('DELETE FROM staff_sessions WHERE token=?').bind(hash(token)).run();return json(200,{ok:true},{'Set-Cookie':'clinic_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure'});}
  if(p==='/staff'&&req.method==='GET'){await staff(req,env);const date=url.searchParams.get('date')||today();if(!validDate(date))throw Error('Invalid date.');return json(200,{...await summary(env,c),push:pushStatus(c),availability:c.availability(date),bookings:c.state.bookings.filter(b=>b.date===date).map(b=>c.view(b)),offers:c.state.offers.slice(-40).reverse().map(o=>({...o,name:c.find(o.bookingId).name})),events:c.state.events.slice(0,40)});}
  if(p==='/bookings'&&req.method==='POST'){await rate(req,env,'book',20);const b=await data(req);const r=await change(env.DB,c=>{const booking=c.book(b);return {booking:c.view(booking),access:booking.access};});let pushError=null;if(b.pushSubscription)try{await subscribe(env,r.result.booking.id,b.pushSubscription);}catch(e){pushError=e.message;}await flushPush(env);await publish(env);return json(201,{...r.result,pushError});}
  const match=p.match(/^\/bookings\/([a-f0-9-]+)(?:\/(cancel|offer|queue|help|handoff|message|push))?$/);
  if(match){const [,id,action]=match;const isStaff=await auth(req,env);const b=isStaff?c.find(id):patient(req,c,id);
   if(!action&&req.method==='GET')return json(200,{push:pushStatus(c,id),booking:c.view(b),...await summary(env,c)});
   if(req.method!=='POST')return json(405,{error:'Method not allowed.'});
   const d=await data(req);
   if(action==='help'){await rate(req,env,'ai',8);const question=String(d.question||'').trim();if(!question||question.length>1000)throw Error('Enter a question under 1,000 characters.');const v=c.view(b);const context={clinic:c.state.settings,appointment:{date:b.date,token:b.token,status:b.status,ahead:v.ahead,waitMin:v.waitMin,scheduledAt:b.scheduledAt,arrivalBy:b.arrivalBy,graceMinutes:5}};const answer=await ask(env,question,context);return json(200,{answer,source:'DNotifier AI'});}
   if(action==='queue'||action==='message')await staff(req,env);
   const r=await change(env.DB,clinic=>{if(!isStaff)patient(req,clinic,id);if(action==='cancel')clinic.cancel(id);else if(action==='offer')clinic.respond(id,d.offerId,d.accept===true);else if(action==='queue')clinic.queue(id,d.action);else if(action==='handoff')clinic.atomic(()=>clinic.event('help.requested',`${clinic.find(id).token} requested reception assistance`,id));else if(action==='message'){const text=String(d.text||'').trim();if(!text||text.length>500)throw Error('Enter a message under 500 characters.');clinic.atomic(()=>clinic.event('reception.message',text,id));}else throw Error('Unknown action.');return clinic.view(clinic.find(id));});await flushPush(env);await publish(env);return json(200,{booking:r.result});
  }
  if(p==='/schedule'&&req.method==='POST'){await staff(req,env);const d=await data(req);await change(env.DB,c=>c.configure(d.date,d));await flushPush(env);await publish(env);return json(200,{ok:true});}
  if(p==='/doctor'&&req.method==='POST'){await staff(req,env);const d=await data(req);await change(env.DB,c=>c.doctor(d.status,Number(d.delay||0),{date:d.date,resumeTime:d.resumeTime}));await flushPush(env);await publish(env);return json(200,{ok:true});}
  if(p==='/profile'&&req.method==='POST'){await staff(req,env);const d=await data(req);if(!String(d.doctor||'').trim()||String(d.doctor).length>80)throw Error('Enter a doctor name under 80 characters.');await change(env.DB,c=>{for(const k of ['doctor','specialty','location','hours']){if(String(d[k]||'').length>160)throw Error('Profile fields must be under 160 characters.');c.state.settings[k]=String(d[k]||'').trim();}const fee=Number(d.fee);if(!Number.isFinite(fee)||fee<0||fee>100000)throw Error('Enter a valid consultation fee.');c.state.settings.fee=fee;c.event('profile.updated','Clinic profile updated');});await flushPush(env);await publish(env);return json(200,{ok:true});}
  return json(404,{error:'Not found.'});
 }catch(e){return json(e.status||400,{error:e.message||'Request failed.',suggestedDate:e.suggestedDate});}
}
