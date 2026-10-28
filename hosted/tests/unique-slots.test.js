import test from 'node:test';
import assert from 'node:assert/strict';
import {Clinic,today,addDays} from '../lib/clinic-domain.js';
import {at} from '../lib/timing.js';
import {nextFreeSlot,assertSlotChanges,repairSlotConflicts,SLOT_MS} from '../lib/appointment-slots.js';
import {moveBooking} from '../lib/booking-assistant.js';
import {change,load} from '../lib/store.js';
const date=addDays(today(),1);
const input={name:'Slot QA',phone:'03001234567',address:'Test Street Lahore',date};
const make=()=>new Clinic(null,()=>at(today(),'15:00'));
function unique(c){const active=c.state.bookings.filter(b=>b.date===date&&!['Cancelled','Absent'].includes(b.status)).sort((a,b)=>a.scheduledAt-b.scheduledAt);for(let i=1;i<active.length;i++)assert.ok(active[i].scheduledAt-active[i-1].scheduledAt>=SLOT_MS);}
test('two bookings get separate whole-minute slots; separate dates may use the same clock time',()=>{const c=make(),a=c.book(input),b=c.book(input),other=c.book({...input,date:addDays(date,1)});assert.equal(b.scheduledAt-a.scheduledAt,SLOT_MS);assert.equal(a.scheduledAt%60000,0);assert.equal(new Date(a.scheduledAt).getUTCHours(),new Date(other.scheduledAt).getUTCHours());unique(c);});
test('completed token time is never allocated again',()=>{const c=make(),a=c.book(input);a.status='Completed';const b=c.book(input);assert.equal(b.scheduledAt,a.scheduledAt+SLOT_MS);unique(c);});
test('out-of-order call and queue reflow do not collide with consultation token time',()=>{let now=at(today(),'16:00');const c=new Clinic(null,()=>now);const one=c.book({...input,date:today()}),two=c.book({...input,date:today()});c.queue(two.id,'check-in');c.queue(two.id,'call');assert.ok(Math.abs(one.scheduledAt-two.scheduledAt)>=SLOT_MS);});
test('rescheduling and doctor delay respect occupied completed slots',()=>{const c=make(),a=c.book(input);a.status='Completed';const b=c.book({...input,date:addDays(date,1)});moveBooking(c,b.id,date);assert.ok(b.scheduledAt>=a.scheduledAt+SLOT_MS);c.doctor('Delayed',15,{date});unique(c);});
test('cancelled slots can be reused without two active reservations',()=>{const c=make(),a=c.book(input);c.cancel(a.id);const b=c.book(input);assert.equal(a.scheduledAt,b.scheduledAt);unique(c);});
test('guard rejects overlapping transactions and accepts adjacent appointments',()=>{const a={id:'a',date,status:'Booked',scheduledAt:at(date,'16:00')};assert.throws(()=>assertSlotChanges([a],[a,{...a,id:'b',scheduledAt:a.scheduledAt+60000}]),/occupied/);assert.doesNotThrow(()=>assertSlotChanges([a],[a,{...a,id:'b',scheduledAt:a.scheduledAt+SLOT_MS}]));});
test('repair preserves records and separates existing duplicate future times',()=>{const c=make(),a=c.book(input),b=c.book(input),key=b.access;b.scheduledAt=a.scheduledAt;repairSlotConflicts(c);unique(c);assert.equal(b.access,key);assert.equal(b.status,'Booked');assert.ok(c.state.events.some(e=>e.type==='schedule.changed'&&e.bookingId===b.id));});
class MemoryD1{row=null;prepare(sql){const db=this;return {async first(){return structuredClone(db.row);},bind(...args){return {async run(){if(sql.startsWith('INSERT')){db.row??={value:args[0],revision:0};return {meta:{changes:0}};}if(sql.startsWith('UPDATE')){if(db.row.revision!==args[1])return {meta:{changes:0}};db.row={value:args[0],revision:db.row.revision+1};return {meta:{changes:1}};}},async first(){return structuredClone(db.row);}};}};}}
test('simultaneous booking requests retry against fresh state and receive distinct times',async()=>{const db=new MemoryD1();const results=await Promise.all(Array.from({length:6},()=>change(db,c=>c.book(input).scheduledAt)));assert.equal(new Set(results.map(r=>r.result)).size,6);unique((await load(db)).clinic);});
test('transaction guard never persists a colliding slot',async()=>{const db=new MemoryD1();await change(db,c=>c.book(input));const old=(await load(db)).revision;await assert.rejects(change(db,c=>{const a=c.state.bookings[0];c.state.bookings.push({...a,id:'collision'});}),/occupied/);assert.equal((await load(db)).revision,old);assert.equal((await load(db)).clinic.state.bookings.length,1);});
