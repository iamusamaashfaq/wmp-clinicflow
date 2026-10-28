import test from 'node:test';
import assert from 'node:assert/strict';
import {Clinic,today,addDays} from '../lib/clinic-domain.js';
import {at} from '../lib/timing.js';
import {blocksSlot} from '../lib/appointment-slots.js';
const date=today();
function setup(){let now=at(date,'15:00');const c=new Clinic(null,()=>now);return {c,set:t=>now=at(date,t),book:()=>c.book({name:'Attendance QA',phone:'03001234567',address:'QA Street Lahore',date})};}
test('arrival is thirty minutes early; reminder is emitted once',()=>{const {c,set,book}=setup(),b=book();assert.equal(b.arrivalBy,b.scheduledAt-1800000);assert.equal(b.noShowAt,b.scheduledAt+1800000);set('15:29');c.expire();assert.equal(c.state.events.filter(e=>e.type==='arrival.reminder').length,0);set('15:30');c.expire();c.expire();assert.equal(c.state.events.filter(e=>e.type==='arrival.reminder').length,1);});
test('missed consultation is absent but remains eligible for late reception check-in',()=>{const {c,set,book}=setup(),b=book();set('16:00');c.expire();assert.equal(b.status,'Absent');assert.equal(b.lateGraceActive,true);assert.ok(blocksSlot(b));set('16:29');c.queue(b.id,'check-in');assert.equal(b.status,'Checked in');assert.equal(b.lateArrival,true);assert.equal(b.lateGraceActive,false);});
test('late check-in closes exactly thirty minutes after consultation',()=>{const {c,set,book}=setup(),b=book();set('16:30');c.expire();assert.equal(b.status,'Absent');assert.equal(b.lateGraceActive,false);assert.ok(!blocksSlot(b));assert.throws(()=>c.queue(b.id,'check-in'),/ended/);});
test('queue updates do not extend the absent grace window',()=>{const {c,set,book}=setup(),b=book();set('16:05');c.expire();const end=b.graceUntil;c.reflow(date,'Queue updated');assert.equal(b.graceUntil,end);assert.equal(b.scheduledAt,at(date,'16:00'));});
test('checked-in patients are not automatically marked absent',()=>{const {c,set,book}=setup(),b=book();c.queue(b.id,'check-in');set('18:00');c.expire();assert.equal(b.status,'Checked in');});
test('monthly capacity is a daily limit with daily override priority',()=>{const {c}=setup();const future=addDays(date,2);c.configure(future,{capacity:80,capacityScope:'month'});assert.equal(c.day(future).capacity,80);c.configure(future,{capacity:65});assert.equal(c.day(future).capacity,65);c.configure(future,{capacity:90,capacityScope:'month'});assert.equal(c.day(future).capacity,65);});
