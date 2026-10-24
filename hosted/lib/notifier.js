import {DNotifier} from '@dnotifier-realtime/dnotifier';
import {change,load} from './store';
let cached=null,cacheTime=0;
export async function client(env){
 if(!env.DNOTIFIER_APP_ID||!(env.DNOTIFIER_SECRET||env.DNOTIFIER_APP_SECRET))throw Error('DNotifier credentials are not configured.');
 if(cached&&Date.now()-cacheTime<120000)return cached;
 const n=new DNotifier({appId:env.DNOTIFIER_APP_ID,secret:(env.DNOTIFIER_SECRET||env.DNOTIFIER_APP_SECRET),transport:'http',userId:'clinicflow-web',logs:false,onConnected:()=>{},onMessage:()=>{},onDisconnected:()=>{}});
 await n.connect();
 // SDK 1.1.25 assumes every successful HTTP response contains JSON. The
 // messaging endpoint can acknowledge with an empty 2xx body. Keep the SDK's
 // packet/auth logic, but accept that documented HTTP success without JSON.
 n.transport.send=async function(packet){const response=await fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json',...this.headers},body:JSON.stringify(packet),signal:AbortSignal.timeout(20000)});const text=await response.text();if(!response.ok)throw Error('DNotifier request failed ('+response.status+').');return text.trim()?JSON.parse(text):{_responseCode:200,accepted:true};};
 cached=n;cacheTime=Date.now();return n;
}
export async function status(env){
 await env.DB.prepare('INSERT OR IGNORE INTO integration(id,sent,received) VALUES(1,0,0)').run();
 const metrics=await env.DB.prepare('SELECT sent,received,last_delivery,error FROM integration WHERE id=1').first();
 let connected=false,aiEnabled=false;try{const n=await client(env);connected=n.isConnected;aiEnabled=n.aiEnabled;}catch{}
 return {configured:!!env.DNOTIFIER_APP_ID,connected,aiEnabled,sent:metrics.sent,received:metrics.received,lastDelivery:metrics.last_delivery,error:metrics.error};
}
export async function publish(env){
 const {clinic}=await load(env.DB);if(!clinic.state.outbox.length)return;
 try{
  const n=await client(env);const receivers=await env.DB.prepare('SELECT id FROM subscribers WHERE expires>? LIMIT 80').bind(Date.now()).all();
  const ids=receivers.results.map(r=>r.id);if(!ids.length)return;
  const events=clinic.state.outbox.slice(0,20);const response=await n.send({senderId:'clinicflow-web',receiverIds:ids,data:{type:'clinicflow-refresh',eventIds:events.map(e=>e.id)},saveHistory:false});
  if(response?._responseCode&&response._responseCode!==200)throw Error('Delivery rejected');
  if(response?.data?.type==='error')throw Error('Delivery rejected');
  await env.DB.prepare('UPDATE integration SET sent=sent+1,error=NULL WHERE id=1').run();
  await change(env.DB,c=>{c.state.outbox=c.state.outbox.filter(x=>!events.some(e=>e.id===x.id));});
 }catch{await env.DB.prepare("UPDATE integration SET error='DNotifier delivery pending; it will retry on the next clinic request.' WHERE id=1").run();}
}
// Workers use fetch Upgrade for outgoing WebSockets. This adapter implements
// the browser WebSocket interface expected by the official DNotifier SDK.
class WorkerSocket {
 static OPEN=1;
 constructor(url){this.listeners=new Map();this.readyState=0;fetch(url.replace(/^wss:/,'https:'),{headers:{Upgrade:'websocket'}}).then(r=>{if(!r.webSocket)throw Error('Upgrade failed');this.socket=r.webSocket;this.socket.accept();this.readyState=1;this.socket.addEventListener('message',e=>this.emit('message',{data:e.data}));this.socket.addEventListener('close',e=>{this.readyState=3;this.emit('close',e);});this.socket.addEventListener('error',e=>this.emit('error',e));this.emit('open',{});}).catch(()=>{this.readyState=3;this.emit('error',{});this.emit('close',{});});}
 addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
 on(type,fn){this.addEventListener(type,fn);return this;}
 emit(type,event){for(const fn of this.listeners.get(type)||[])fn(event);}
 send(data){this.socket.send(data);}
 close(){this.socket?.close(1000,'Session ended');this.readyState=3;}
}
export function eventStream(request,env){
 const id='web-'+crypto.randomUUID();const encoder=new TextEncoder();let socket,interval,closed=false;
 const stream=new ReadableStream({async start(controller){
  const send=source=>{if(!closed)try{controller.enqueue(encoder.encode(`data: ${JSON.stringify({source,at:Date.now()})}\n\n`));}catch{closed=true;}};
  const cleanup=()=>{if(closed)return;closed=true;clearInterval(interval);socket?.transport?.close?.();env.DB.prepare('DELETE FROM subscribers WHERE id=?').bind(id).run().catch(()=>{});try{controller.close();}catch{}};
  request.signal.addEventListener('abort',cleanup);send('connected');
  try{socket=new DNotifier({appId:env.DNOTIFIER_APP_ID,secret:(env.DNOTIFIER_SECRET||env.DNOTIFIER_APP_SECRET),transport:'ws',userId:id,WebSocketImpl:WorkerSocket,logs:false,onConnected:()=>{env.DB.prepare('INSERT OR REPLACE INTO subscribers(id,expires) VALUES(?,?)').bind(id,Date.now()+75000).run().then(()=>send('dnotifier-ready'));},onMessage:msg=>{try{const p=msg.payload.toJSON();if(p.type==='clinicflow-refresh'){env.DB.prepare('UPDATE integration SET received=received+1,last_delivery=? WHERE id=1').bind(Date.now()).run().catch(()=>{});send('dnotifier');}}catch{}},onDisconnected:()=>send('dnotifier-offline')});await socket.connect();}catch{send('dnotifier-offline');}
  interval=setInterval(()=>{if(closed){clearInterval(interval);socket?.transport?.close?.();return;}env.DB.prepare('UPDATE subscribers SET expires=? WHERE id=?').bind(Date.now()+75000,id).run().catch(()=>{});try{controller.enqueue(encoder.encode(': heartbeat\n\n'));}catch{cleanup();}},25000);
  setTimeout(cleanup,240000);
 },cancel(){closed=true;clearInterval(interval);socket?.transport?.close?.();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Content-Type-Options':'nosniff'}});
}
export async function ask(env,question,context){
 const n=await client(env);if(!n.aiEnabled)throw Error('AI access is not enabled. Reception can help with your visit.');
 const workflow=new DNotifier.Workflow({name:'clinicflow-web-assistant',description:'Administrative clinic questions using authorized live appointment data',observability:true,async entry(ctx){return ctx.sendAI({message:{...(env.DNOTIFIER_AI_PROVIDER?{provider:env.DNOTIFIER_AI_PROVIDER}:{}),...(env.DNOTIFIER_AI_MODEL?{model:env.DNOTIFIER_AI_MODEL}:{}),messages:[{role:'system',content:'You are ClinicFlow administrative help. Reply in the language used, including Roman Urdu. Use ONLY the supplied clinic and appointment context. Do not diagnose, recommend treatment, change appointments or invent information. For medical or unknown questions, direct the patient to reception. Wait times are estimates after check-in. Context: '+JSON.stringify(context)},{role:'user',content:question}]},saveHistory:false,label:'Answer administrative question'});}});
 const run=await n.runWorkflow({workflow,input:{question},senderId:'clinicflow-web'});const p=run.result?.data??run.result;
 if(p?.type==='error'){if(/provider is required|model.*required/i.test(p.message||''))throw Error('AI provider setup is pending in DNotifier. Your booking works; please use reception help.');throw Error('DNotifier AI could not answer. Please contact reception.');}
 const text=typeof p==='string'?p:p?.content??p?.text??p?.answer??p?.message?.content;
 if(typeof text!=='string')throw Error('No readable AI answer was returned. Please contact reception.');return text;
}
