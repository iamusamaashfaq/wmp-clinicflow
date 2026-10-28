// This clinic has one doctor. A token occupies a 15-minute consultation interval.
export const SLOT_MS=15*60000;
export const blocksSlot=b=>!['Cancelled','Absent'].includes(b.status)&&Number.isFinite(b.scheduledAt);
export const minuteCeiling=t=>Math.ceil(t/60000)*60000;
export function nextFreeSlot(clinic,date,requested,excludeIds=[]){
 let start=minuteCeiling(requested);const excluded=new Set(excludeIds);
 const occupied=clinic.state.bookings.filter(b=>b.date===date&&blocksSlot(b)&&!excluded.has(b.id)).sort((a,b)=>a.scheduledAt-b.scheduledAt);
 for(const b of occupied){if(start+SLOT_MS<=b.scheduledAt)break;if(start<b.scheduledAt+SLOT_MS&&start+SLOT_MS>b.scheduledAt)start=minuteCeiling(b.scheduledAt+SLOT_MS);}
 return start;
}
export function assertSlotChanges(previous,current){
 const old=new Map(previous.map(b=>[b.id,b]));
 for(const b of current){if(!blocksSlot(b))continue;const original=old.get(b.id);
  if(original&&blocksSlot(original)&&original.date===b.date&&original.scheduledAt===b.scheduledAt)continue;
  if(!Number.isFinite(b.scheduledAt)||b.scheduledAt%60000!==0)throw Object.assign(Error('Choose a whole-minute appointment time.'),{status:409});
  const conflict=current.find(other=>other.id!==b.id&&other.date===b.date&&blocksSlot(other)&&b.scheduledAt<other.scheduledAt+SLOT_MS&&b.scheduledAt+SLOT_MS>other.scheduledAt);
  if(conflict)throw Object.assign(Error('This consultation time is already occupied. Please refresh for the next available time; no booking change was saved.'),{status:409});
 }
}
export function repairSlotConflicts(clinic){
 const waiting=clinic.state.bookings.filter(b=>b.date>=clinic.dateNow()&&['Booked','Checked in'].includes(b.status)&&Number.isFinite(b.scheduledAt)).sort((a,b)=>a.date.localeCompare(b.date)||a.scheduledAt-b.scheduledAt||a.created-b.created);
 const pending=new Set(waiting.map(b=>b.id));
 for(const b of waiting){let start=nextFreeSlot(clinic,b.date,b.scheduledAt,[...pending]);if(start!==b.scheduledAt){if(b.date===clinic.dateNow())start=nextFreeSlot(clinic,b.date,Math.max(start,clinic.clock()+SLOT_MS),[...pending]);Object.assign(b,{scheduledAt:start,arrivalBy:start-SLOT_MS,noShowAt:start+300000,remindedFor:null});clinic.event('schedule.changed',`${b.token}: consultation time adjusted to avoid a duplicate slot. Consultation ${new Date(start).toLocaleTimeString('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'})} PKT. Please check your updated arrival time.`,b.id);}pending.delete(b.id);}
}
