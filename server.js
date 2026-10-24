import http from 'node:http';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {Clinic,today,addDays,validDate} from './clinic.js';
import {NotifierBridge} from './dnotifier.js';
const root=path.dirname(fileURLToPath(import.meta.url));mkdirSync(path.join(root,'data'),{recursive:true});
const clinic=new Clinic(process.env.DB_FILE||path.join(root,'data','clinic.sqlite'));
if(!process.env.STAFF_PASSWORD){console.error('Set STAFF_PASSWORD in .env before starting. See README.md.');process.exit(1);}
const sessions=new Map(),clients=new Set(),attempts=new Map();
const bridge=new NotifierBridge(clinic,()=>broadcast('dnotifier'));
function broadcast(source){for(const c of clients)c.res.write(`data: ${JSON.stringify({source,at:Date.now()})}\n\n`);}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function auth(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('clinic_staff='));const token=cookie?.slice(13);const s=sessions.get(token);if(s&&s>Date.now())return true;return false;}
function patient(req,id){const b=clinic.find(id);const token=req.headers['x-patient-key'];if(typeof token!=='string'||token.length!==b.access.length||!timingSafeEqual(Buffer.from(token),Buffer.from(b.access)))throw Object.assign(Error('Private booking access required.'),{status:403});return b;}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>16000)throw Error('Request too large.');}return data?JSON.parse(data):{};}
function staff(req){if(!auth(req))throw Object.assign(Error('Please sign in to reception.'),{status:401});}
const summary=()=>({today:today(),settings:clinic.state.settings,dnotifier:{...bridge.status,pending:clinic.state.outbox.length},serverTime:Date.now()});
function rate(req,key,max=30){const k=req.socket.remoteAddress+':'+key;const old=attempts.get(k);const a=old&&old.until>Date.now()?old:{n:0,until:Date.now()+60000};a.n++;attempts.set(k,a);if(a.n>max)throw Object.assign(Error('Too many requests. Please wait one minute.'),{status:429});}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  try{
    const url=new URL(req.url,'http://localhost');const p=url.pathname;
    if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)throw Object.assign(Error('Cross-origin request denied.'),{status:403});
    if(p==='/api/public'&&req.method==='GET')return json(res,200,summary());
    if(p==='/api/availability'&&req.method==='GET'){const date=url.searchParams.get('date');if(!validDate(date)||date<today()||date>addDays(today(),89))throw Error('Invalid booking date.');return json(res,200,{...clinic.availability(date),suggestedDate:clinic.nextDate(date)});}
    if(p==='/api/login'&&req.method==='POST'){rate(req,'login',8);const b=await body(req);const a=Buffer.from(String(b.password||'')),expected=Buffer.from(process.env.STAFF_PASSWORD);if(a.length!==expected.length||!timingSafeEqual(a,expected))throw Object.assign(Error('Incorrect reception password.'),{status:401});const t=randomBytes(32).toString('hex');sessions.set(t,Date.now()+12*3600000);res.setHeader('Set-Cookie',`clinic_staff=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);return json(res,200,{ok:true});}
    if(p==='/api/logout'&&req.method==='POST'){const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('clinic_staff='));if(c)sessions.delete(c.slice(13));res.setHeader('Set-Cookie','clinic_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
    if(p==='/api/staff'&&req.method==='GET'){staff(req);const date=url.searchParams.get('date')||today();if(!validDate(date))throw Error('Invalid date.');return json(res,200,{...summary(),availability:clinic.availability(date),bookings:clinic.state.bookings.filter(b=>b.date===date).map(b=>clinic.view(b)),offers:clinic.state.offers.slice(-40).reverse().map(o=>({...o,name:clinic.find(o.bookingId).name})),events:clinic.state.events.slice(0,40)});}
    if(p==='/api/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: {"source":"connected"}\n\n');const c={res};clients.add(c);req.on('close',()=>clients.delete(c));return;}
    if(p==='/api/bookings'&&req.method==='POST'){rate(req,'book',20);const b=clinic.book(await body(req));broadcast('local');void bridge.flush();return json(res,201,{booking:clinic.view(b),access:b.access});}
    const booking=p.match(/^\/api\/bookings\/([a-f0-9-]+)(?:\/(cancel|offer|queue|help|handoff))?$/);
    if(booking){const [,id,action]=booking;const isStaff=auth(req);const b=isStaff?clinic.find(id):patient(req,id);
      if(!action&&req.method==='GET')return json(res,200,{booking:clinic.view(b),...summary()});
      if(req.method==='POST'){const data=await body(req);if(action==='cancel')clinic.cancel(id);else if(action==='offer')clinic.respond(id,data.offerId,data.accept===true);else if(action==='queue'){staff(req);clinic.queue(id,data.action);}
        else if(action==='help'){rate(req,'ai',10);const question=String(data.question||'').trim();if(!question||question.length>1000)throw Error('Enter a question under 1,000 characters.');const view=clinic.view(b);try{const answer=await Promise.race([bridge.ask(question,{clinic:clinic.state.settings,booking:{date:b.date,token:b.token,status:b.status,ahead:view.ahead,waitMin:view.waitMin}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('AI response timed out. Please contact reception.')),20000))]);return json(res,200,{answer,source:'DNotifier AI'});}catch(e){return json(res,503,{error:e.message,source:'AI unavailable'});}}
        else if(action==='handoff'){rate(req,'handoff',10);clinic.atomic(()=>clinic.event('help.requested',`${b.token} requested reception assistance`,b.id));}
        else throw Error('Unknown action.');broadcast('local');void bridge.flush();return json(res,200,{booking:clinic.view(b)});}
    }
    if(p==='/api/schedule'&&req.method==='POST'){staff(req);const b=await body(req);clinic.configure(b.date,b);broadcast('local');void bridge.flush();return json(res,200,{ok:true});}
    if(p==='/api/doctor'&&req.method==='POST'){staff(req);const b=await body(req);clinic.doctor(b.status,Number(b.delay||0));broadcast('local');void bridge.flush();return json(res,200,{ok:true});}
    if(p.startsWith('/api/'))return json(res,404,{error:'Not found.'});
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
    const files={'/':'index.html','/reception':'index.html','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg'};
    const file=files[p];if(!file)return json(res,404,{error:'Not found.'});
    const content=readFileSync(path.join(root,'public',file));const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml'})[ext],'Cache-Control':'no-cache'});res.end(content);
  }catch(e){json(res,e.status||400,{error:e.message||'Request failed.',suggestedDate:e.suggestedDate});}
});
setInterval(()=>{if(clinic.expire())broadcast('local');void bridge.flush();},3000).unref();
setInterval(()=>{for(const c of clients)c.res.write(': heartbeat\n\n');for(const[k,s]of sessions)if(s<Date.now())sessions.delete(k);for(const[k,a]of attempts)if(a.until<Date.now())attempts.delete(k);},25000).unref();
const port=Number(process.env.PORT||4310);server.listen(port,process.env.HOST||'0.0.0.0',()=>{console.log(`ClinicFlow ready: http://localhost:${port}`);for(const list of Object.values(networkInterfaces()))for(const net of list||[])if(net.family==='IPv4'&&!net.internal)console.log(`Team network: http://${net.address}:${port}`);void bridge.connect();});
