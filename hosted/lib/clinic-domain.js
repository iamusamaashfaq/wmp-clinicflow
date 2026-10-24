import { randomUUID, randomBytes } from 'node:crypto';

export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date()); }
export function addDays(date,n) { const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10); }
export function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d||'') && !Number.isNaN(Date.parse(d)) && new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d; }
export class Clinic {
  constructor(state=null, clock=()=>Date.now()) { this.clock=clock; this.state=state || {settings:{capacity:50,offerMinutes:5,cutoff:'23:59',doctor:'Dr. Sarah Ahmed',specialty:'General physician',hours:'4:00 PM – 9:00 PM',fee:1500,location:'WMP Demo Clinic, Lahore',doctorStatus:'Available',delay:0},days:{},bookings:[],offers:[],events:[],counters:{},outbox:[]}; }
  atomic(fn){const old=structuredClone(this.state);try{return fn();}catch(e){this.state=old;throw e;}}
  event(type,text,bookingId=null){const event={id:randomUUID(),type,text,bookingId,at:this.clock()};this.state.events.unshift(event);this.state.events=this.state.events.slice(0,300);this.state.outbox.push({id:event.id,type,at:event.at});return event;}
  day(date){return {capacity:this.state.settings.capacity,closed:false,...this.state.days[date]};}
  active(b){return !['Cancelled','Absent'].includes(b.status);}
  usage(date){return this.state.bookings.filter(b=>b.date===date&&this.active(b)).length;}
  reserved(date){return this.state.offers.filter(o=>o.date===date&&o.status==='Pending'&&o.expires>this.clock()).length;}
  availability(date){const d=this.day(date);const used=this.usage(date),reserved=this.reserved(date);return {date,...d,used,reserved,remaining:d.closed?0:Math.max(0,d.capacity-used-reserved)};}
  nextDate(date){for(let i=0;i<90;i++){const d=addDays(date,i);if(this.availability(d).remaining>0)return d;}return null;}
  nextWorking(date){for(let i=1;i<=90;i++){const d=addDays(date,i);if(!this.day(d).closed)return d;}return null;}
  token(date){const n=(this.state.counters[date]||0)+1;this.state.counters[date]=n;return 'A-'+String(n).padStart(3,'0');}
  book({name,date,optIn=false,earliest='00:00'}){return this.atomic(()=>{
    if(typeof name!=='string'||name.trim().length<2||name.length>80)throw Error('Enter a name between 2 and 80 characters.');
    if(!validDate(date)||date<today()||date>addDays(today(),89))throw Error('Choose a date within the next 90 days.');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(earliest))throw Error('Choose a valid arrival time.');
    if(this.availability(date).remaining<1){const e=Error('This date is full or closed. Please confirm the suggested next date.');e.suggestedDate=this.nextDate(date);throw e;}
    const b={id:randomUUID(),access:randomBytes(24).toString('hex'),name:name.trim(),date,token:this.token(date),status:'Booked',optIn:!!optIn,earliest,created:this.clock(),checkedIn:null};this.state.bookings.push(b);this.event('booking.created',`${b.token} booked for ${date}`,b.id);return b;
  });}
  find(id){const b=this.state.bookings.find(b=>b.id===id);if(!b)throw Error('Booking not found.');return b;}
  beforeCutoff(){const hhmm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(this.clock()));return hhmm<this.state.settings.cutoff;}
  fill(date){if(date!==today()||!this.beforeCutoff()||this.day(date).closed)return;const next=this.nextWorking(date);if(!next)return;
    while(this.availability(date).remaining>0){
      const candidates=this.state.bookings.filter(b=>b.date===next&&b.status==='Booked'&&b.optIn&&b.earliest<=this.state.settings.cutoff&&!this.state.offers.some(o=>o.bookingId===b.id&&o.date===date&&['Pending','Declined','Expired','Accepted'].includes(o.status))).sort((a,b)=>a.created-b.created);
      const b=candidates[0];if(!b)break;
      const o={id:randomUUID(),bookingId:b.id,date,originalDate:b.date,status:'Pending',created:this.clock(),expires:this.clock()+this.state.settings.offerMinutes*60000};this.state.offers.push(o);this.event('offer.created',`Earlier appointment offered to ${b.token}`,b.id);
    }
  }
  cancel(id){return this.atomic(()=>{const b=this.find(id);if(!['Booked','Checked in'].includes(b.status))throw Error('Only waiting appointments can be cancelled.');b.status='Cancelled';for(const o of this.state.offers)if(o.bookingId===id&&o.status==='Pending')o.status='Invalidated';this.event('booking.cancelled',`${b.token} cancelled`,id);this.fill(b.date);this.fill(today());return b;});}
  respond(id,offerId,accept){return this.atomic(()=>{const b=this.find(id);const o=this.state.offers.find(o=>o.id===offerId&&o.bookingId===id);if(!o||o.status!=='Pending'||o.expires<=this.clock()||o.date!==today()||!this.beforeCutoff())throw Error('This offer is no longer available. Your original booking is safe.');
    if(b.date!==o.originalDate||b.status!=='Booked')throw Error('Booking is no longer eligible.');
    if(accept){if(this.day(o.date).closed||this.usage(o.date)>=this.day(o.date).capacity)throw Error('Slot is no longer available.');const oldDate=b.date;b.date=o.date;b.token=this.token(o.date);o.status='Accepted';this.event('offer.accepted',`Earlier slot confirmed: ${b.token} on ${b.date}`,id);this.fill(oldDate);}
    else{o.status='Declined';this.event('offer.declined','Patient kept original appointment',id);this.fill(o.date);}return b;
  });}
  expire(){return this.atomic(()=>{let changed=false;for(const o of this.state.offers)if(o.status==='Pending'&&(o.expires<=this.clock()||o.date!==today()||!this.beforeCutoff())){o.status='Expired';this.event('offer.expired','Earlier-slot offer expired',o.bookingId);changed=true;}if(changed)this.fill(today());return changed;});}
  configure(date,body){return this.atomic(()=>{if(!validDate(date)||date<today())throw Error('Choose today or a future date.');const cap=Number(body.capacity);if(!Number.isInteger(cap)||cap<1||cap>500)throw Error('Capacity must be 1–500.');if(cap<this.usage(date)+this.reserved(date))throw Error('Capacity cannot be below existing bookings and reserved offers.');if(body.closed&&this.usage(date)+this.reserved(date)>0)throw Error('Reschedule existing bookings before closing this day.');this.state.days[date]={capacity:cap,closed:!!body.closed};if(body.defaultCapacity)this.state.settings.capacity=cap;if(body.offerMinutes!==undefined){const m=Number(body.offerMinutes);if(!Number.isInteger(m)||m<1||m>60)throw Error('Offer expiry must be 1–60 minutes.');this.state.settings.offerMinutes=m;}
    if(body.cutoff!==undefined){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.cutoff))throw Error('Invalid cutoff time.');this.state.settings.cutoff=body.cutoff;}this.event('schedule.updated',`Capacity for ${date}: ${cap}${body.closed?' (closed)':''}`);});}
  doctor(status,delay){return this.atomic(()=>{if(!['Available','Delayed','On break','Session finished'].includes(status))throw Error('Invalid doctor status.');if(!Number.isInteger(delay)||delay<0||delay>240)throw Error('Delay must be 0–240 minutes.');Object.assign(this.state.settings,{doctorStatus:status,delay});this.event('doctor.updated',`Doctor ${status.toLowerCase()}${delay?` · ${delay} min delay`:''}`);});}
  queue(id,action){return this.atomic(()=>{const b=this.find(id);if(b.date!==today())throw Error('Queue actions are only available for today.');const transitions={'check-in':['Booked','Checked in'],'call':['Checked in','In consultation'],'complete':['In consultation','Completed'],'absent':['Checked in','Absent']};const t=transitions[action];if(!t||b.status!==t[0])throw Error('This queue action is not valid for the current status.');if(action==='call'&&this.state.bookings.some(x=>x.date===today()&&x.status==='In consultation'))throw Error('Complete the current consultation first.');b.status=t[1];if(action==='check-in')b.checkedIn=this.clock();this.event('queue.updated',`${b.token}: ${b.status}`,id);return b;});}
  view(b){const queue=this.state.bookings.filter(x=>x.date===b.date&&['Checked in','In consultation'].includes(x.status)).sort((a,b)=>(a.checkedIn||0)-(b.checkedIn||0));const index=queue.findIndex(x=>x.id===b.id);const ahead=index<0?queue.length:index;const {access,...safe}=b;return {...safe,ahead,waitMin:ahead*10+this.state.settings.delay,offer:this.state.offers.find(o=>o.bookingId===b.id&&o.status==='Pending'&&o.expires>this.clock())||null,notifications:this.state.events.filter(e=>e.bookingId===b.id||e.type==='doctor.updated').slice(0,15)};}
  close(){}
}
