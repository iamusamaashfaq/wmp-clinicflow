import {Clinic} from './clinic-domain.js';
import {assertSlotChanges} from './appointment-slots.js';
export async function load(db){
 await db.prepare('INSERT OR IGNORE INTO clinic_state(id,value,revision) VALUES(1,?,0)').bind(JSON.stringify(new Clinic().state)).run();
 const row=await db.prepare('SELECT value,revision FROM clinic_state WHERE id=1').first();return {clinic:new Clinic(JSON.parse(row.value)),revision:row.revision};
}
// A compare-and-swap prevents two Workers from booking the same final slot.
export async function change(db,fn){
 for(let attempt=0;attempt<8;attempt++){
  const {clinic,revision}=await load(db);const previous=clinic.state.bookings.map(b=>({id:b.id,date:b.date,status:b.status,scheduledAt:b.scheduledAt}));const result=fn(clinic);
  assertSlotChanges(previous,clinic.state.bookings);
  const update=await db.prepare('UPDATE clinic_state SET value=?,revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(clinic.state),revision).run();
  if(update.meta.changes===1)return {result,clinic};
 }
 throw Error('The clinic is busy. Please retry; no booking was confirmed.');
}
export async function expire(db){const current=await load(db);if(Date.now()-(current.clinic.state.lastClockTick||0)<15000)return;await change(db,c=>{if(Date.now()-(c.state.lastClockTick||0)>=15000)c.expire();});}
