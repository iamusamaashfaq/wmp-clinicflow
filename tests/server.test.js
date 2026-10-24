import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('HTTP integration: staff protection, booking rollover, private access and earlier acceptance',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'clinicflow-test-'));
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'4319',HOST:'127.0.0.1',STAFF_PASSWORD:'integration-test-only',DB_FILE:path.join(dir,'test.sqlite'),DNOTIFIER_APP_ID:'',DNOTIFIER_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server start timeout')),10000);child.stdout.on('data',b=>{if(b.toString().includes('ClinicFlow ready')){clearTimeout(timer);resolve();}});child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('Server exited '+code));});});
  const base='http://127.0.0.1:4319/api';let cookie='';
  async function call(p,method='GET',data,key){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(key?{'X-Patient-Key':key}:{})},...(data?{body:JSON.stringify(data)}:{})});return {r,data:await r.json()};}
  assert.equal((await call('/staff')).r.status,401);
  let response=await call('/login','POST',{password:'integration-test-only'});assert.equal(response.r.status,200);cookie=response.r.headers.get('set-cookie').split(';')[0];
  const pub=(await call('/public')).data,date=pub.today;const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);const tomorrow=next.toISOString().slice(0,10);
  assert.equal((await call('/schedule','POST',{date,capacity:1,cutoff:'23:59'})).r.status,200);
  const first=(await call('/bookings','POST',{name:'Today Demo',date,earliest:'00:00'})).data;
  const overflow=await call('/bookings','POST',{name:'Overflow Demo',date,earliest:'00:00'});assert.equal(overflow.r.status,400);assert.equal(overflow.data.suggestedDate,tomorrow);
  const second=(await call('/bookings','POST',{name:'Next Demo',date:tomorrow,optIn:true,earliest:'00:00'})).data;
  await call('/bookings/'+first.booking.id+'/cancel','POST',{});
  const state=(await call('/staff?date='+date)).data;assert.equal(state.availability.reserved,1);
  cookie='';assert.equal((await call('/bookings/'+second.booking.id)).r.status,403);
  const privateView=(await call('/bookings/'+second.booking.id,'GET',null,second.access)).data;assert.ok(privateView.booking.offer);assert.equal(privateView.booking.access,undefined);
  response=await call('/bookings/'+second.booking.id+'/offer','POST',{offerId:privateView.booking.offer.id,accept:true},second.access);assert.equal(response.r.status,200);assert.equal(response.data.booking.date,date);
  assert.equal((await call('/bookings/'+second.booking.id+'/offer','POST',{offerId:privateView.booking.offer.id,accept:true},second.access)).r.status,400);
  const html=await fetch('http://127.0.0.1:4319/');assert.equal(html.status,200);assert.ok(html.headers.get('content-security-policy'));
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true});}
});
