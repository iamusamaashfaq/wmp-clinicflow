import {validDate,today,addDays} from './clinic-domain.js';

export const REPORT_STATUSES=['All','Booked','Checked in','In consultation','Completed','Cancelled','Absent'];
export function makeReport(clinic,filters={},generatedAt=Date.now()){
 const from=filters.from||today(),to=filters.to||from,status=filters.status||'All';
 if(!validDate(from)||!validDate(to))throw Error('Choose valid report dates.');
 if(to<from)throw Error('The end date must be on or after the start date.');
 if(to>addDays(from,92))throw Error('Choose a report period of 93 days or less.');
 if(!REPORT_STATUSES.includes(status))throw Error('Choose a valid appointment status.');
 const bookings=clinic.state.bookings.filter(b=>b.date>=from&&b.date<=to&&(status==='All'||b.status===status)).sort((a,b)=>a.date.localeCompare(b.date)||a.token.localeCompare(b.token,undefined,{numeric:true})||a.created-b.created);
 if(bookings.length>5000)throw Error('This report exceeds 5,000 appointments. Choose a shorter period.');
 const counts={total:bookings.length,waiting:0,completed:0,cancelled:0,absent:0};
 for(const b of bookings){if(['Booked','Checked in','In consultation'].includes(b.status))counts.waiting++;else if(b.status==='Completed')counts.completed++;else if(b.status==='Cancelled')counts.cancelled++;else if(b.status==='Absent')counts.absent++;}
 return {
  from,to,status,generatedAt,timezone:'Asia/Karachi',
  clinic:{doctor:clinic.state.settings.doctor,specialty:clinic.state.settings.specialty,location:clinic.state.settings.location},
  counts,
  // Reports deliberately exclude access keys, booking URLs and internal IDs.
  rows:bookings.map(b=>({token:b.token,name:b.name,date:b.date,status:b.status,optIn:!!b.optIn,created:b.created})),
 };
}
