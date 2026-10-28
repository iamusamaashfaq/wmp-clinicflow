import {repairSlotConflicts} from './appointment-slots.js';
export function advanceAttendance(c,expireOffers){
 c.ready();c.state.lastClockTick=c.clock();repairSlotConflicts(c);expireOffers();
 const date=c.dateNow(),session=c.session(date),now=c.clock();
 if(session.resumeAt&&session.resumeAt<=now&&['Delayed','On break'].includes(session.status)){session.status='Available';session.resumeAt=0;c.state.settings.doctorStatus='Available';c.state.settings.delay=0;c.event('doctor.updated','Doctor is available again.');}
 let released=false;
 const consulting=c.state.bookings.some(b=>b.date===date&&b.status==='In consultation');
 for(const b of c.state.bookings.filter(b=>b.date===date)){
  if(b.status==='Booked'&&b.autoCancelEnabled&&b.scheduledAt<=now&&session.status==='Available'&&!consulting){
   b.status='Absent';b.graceUntil=b.scheduledAt+30*60000;b.noShowAt=b.graceUntil;b.lateGraceActive=now<b.graceUntil;
   c.event('booking.absent',`${b.token}: not checked in at consultation time.${b.lateGraceActive?' Your booking is held for 30 minutes; report to reception to check in.':' The 30-minute late-arrival window has ended.'}`,b.id);
   if(!b.lateGraceActive){b.graceEndedAt=now;released=true;}
  }else if(b.status==='Absent'&&b.lateGraceActive&&b.graceUntil<=now){b.lateGraceActive=false;b.graceEndedAt=now;released=true;c.event('booking.absent-final',`${b.token}: the 30-minute late-arrival window has ended. Marked absent; please make another booking.`,b.id);}
 }
 if(released){c.reflow(date,'A late-arrival window ended');c.fill(date);}
 for(const b of c.waiting(date))if(b.status==='Booked'&&b.scheduledAt&&b.remindedFor!==b.scheduledAt&&b.arrivalBy<=now&&now<b.scheduledAt){b.remindedFor=b.scheduledAt;c.event('arrival.reminder',`${b.token}: please be at the clinic 30 minutes before your consultation. Report to reception for check-in.`,b.id);}
 return true;
}
