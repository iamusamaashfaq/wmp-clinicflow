import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Clinic,addDays} from '../lib/clinic-domain.js';
import {makeReport} from '../lib/reports.js';

const date='2026-10-24';
function fixture(){const c=new Clinic();c.state.bookings=[
 {id:'private-1',access:'DO-NOT-EXPORT',name:'First Patient',date,token:'A-001',status:'Booked',created:100,optIn:true},
 {id:'private-2',access:'DO-NOT-EXPORT-2',name:'Completed Patient',date,token:'A-002',status:'Completed',created:101,optIn:false},
 {id:'private-3',access:'DO-NOT-EXPORT-3',name:'Cancelled Patient',date:addDays(date,1),token:'A-001',status:'Cancelled',created:102,optIn:true},
 {id:'private-4',access:'DO-NOT-EXPORT-4',name:'Absent Patient',date:addDays(date,1),token:'A-002',status:'Absent',created:103,optIn:false},
 ];return c;}
test('report includes boundaries and accurate counts by current appointment status',()=>{const r=makeReport(fixture(),{from:date,to:addDays(date,1)},1234);assert.deepEqual(r.counts,{total:4,waiting:1,completed:1,cancelled:1,absent:1});assert.equal(r.rows[0].token,'A-001');assert.equal(r.generatedAt,1234);});
test('status and date filters apply to both register and summary',()=>{const r=makeReport(fixture(),{from:date,to:date,status:'Completed'});assert.equal(r.counts.total,1);assert.equal(r.counts.completed,1);assert.equal(r.rows[0].name,'Completed Patient');assert.equal(r.counts.waiting,0);});
test('report excludes secrets, private links and internal booking IDs',()=>{const r=makeReport(fixture(),{from:date,to:addDays(date,1)});assert.ok(!JSON.stringify(r).includes('DO-NOT-EXPORT'));assert.ok(!JSON.stringify(r).includes('private-1'));assert.equal(r.rows[0].access,undefined);});
test('invalid dates, reversed dates, long periods and unknown statuses are rejected',()=>{const c=fixture();assert.throws(()=>makeReport(c,{from:'2026-02-30',to:date}));assert.throws(()=>makeReport(c,{from:date,to:'2026-10-23'}));assert.throws(()=>makeReport(c,{from:date,to:addDays(date,93)}));assert.throws(()=>makeReport(c,{from:date,to:date,status:'Unknown'}));});
test('empty report is a valid zero-count result',()=>{const r=makeReport(fixture(),{from:'2026-10-20',to:'2026-10-20'});assert.equal(r.rows.length,0);assert.equal(r.counts.total,0);});
