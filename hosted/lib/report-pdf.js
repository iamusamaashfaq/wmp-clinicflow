import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const C={teal:rgb(.031,.498,.502),navy:rgb(.09,.231,.275),muted:rgb(.38,.49,.53),line:rgb(.86,.91,.90),mist:rgb(.96,.98,.98),mint:rgb(.91,.96,.94),white:rgb(1,1,1)};
const DATE=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',day:'2-digit',month:'short',year:'numeric'});
const formatDate=date=>DATE.format(new Date(date+'T12:00:00Z'));
const time=ms=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'}).format(new Date(ms))+' PKT';
const clean=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
let cachedFonts=null;
export async function reportFonts(origin){
 if(cachedFonts)return cachedFonts;
 const files=['OpenSans-Variable.ttf','Poppins-SemiBold.ttf','NotoSansArabic-Variable.ttf'];
 const bytes=await Promise.all(files.map(async file=>{const r=await fetch(new URL('/fonts/'+file,origin));if(!r.ok)throw Error('Report fonts could not be loaded. Please retry.');return new Uint8Array(await r.arrayBuffer());}));
 cachedFonts=bytes;return bytes;
}
export async function makeReportPdf(report,fontBytes){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const [body,heading,arabic]=await Promise.all(fontBytes.map(bytes=>pdf.embedFont(bytes,{subset:true})));
 const support=new Map([body,heading,arabic].map(f=>[f,new Set(f.getCharacterSet())]));
 const fontFor=text=>/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(text)?arabic:body;
 let substitutions=false;
 function supported(text,font){return [...clean(text)].map(char=>{if(support.get(font).has(char.codePointAt(0)))return char;substitutions=true;return '[U+'+char.codePointAt(0).toString(16).toUpperCase()+']';}).join('');}
 function line(text,maxWidth,font=body,size=9.3){
  const words=supported(text,font).split(' ');const lines=[];let current='';
  for(const word of words){const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)<=maxWidth){current=next;continue;}if(current)lines.push(current);current='';let piece='';for(const char of word){if(piece&&font.widthOfTextAtSize(piece+char,size)>maxWidth){lines.push(piece);piece=char;}else piece+=char;}current=piece;}
  if(current||!lines.length)lines.push(current);return lines;
 }
 const W=595.28,H=841.89,M=38,CW=W-2*M;let page,y;
 function text(value,x,y,size=9.3,font=body,color=C.navy){page.drawText(supported(value,font),{x,y,size,font,color});}
 function wrap(value,x,y,width,size=9.3,font=body,color=C.navy){const lines=line(value,width,font,size);for(const [i,s] of lines.entries())text(s,x,y-i*(size+3),size,font,color);return lines.length*(size+3);}
 function logo(){page.drawSvgPath('M27 0 H69 Q96 0 96 27 V69 Q96 96 69 96 H27 Q0 96 0 69 V27 Q0 0 27 0 Z',{x:M,y:H-35,scale:.36,color:C.teal});page.drawSvgPath('M43 31 H53 V43 H65 V53 H53 V65 H43 V53 H31 V43 H43 Z',{x:M,y:H-35,scale:.36,color:C.white});text('ClinicFlow',M+46,H-56,18,heading,C.navy);text('BY WMP  /  CLINIC OPERATIONS',M+47,H-70,7.5,body,C.muted);}
 function newPage(first){page=pdf.addPage([W,H]);logo();page.drawLine({start:{x:M,y:H-92},end:{x:W-M,y:H-92},thickness:.7,color:C.line});y=H-121;
  text(first?'Appointment report':'Appointment register - continued',M,y,18,heading);y-=23;
  text(`${formatDate(report.from)} to ${formatDate(report.to)}`,M,y,10,body);text('Status: '+(report.status==='All'?'All statuses':report.status),W-M-170,y,9,body,C.muted);y-=20;
  if(first){y-=wrap(report.clinic.doctor,M,y,CW,11,heading);y-=wrap(report.clinic.location,M,y,CW,9,body,C.muted);text('Generated '+time(report.generatedAt),M,y-2,8.2,body,C.muted);y-=27;
   const stats=[['APPOINTMENTS',report.counts.total],['WAITING / ACTIVE',report.counts.waiting],['COMPLETED',report.counts.completed],['CANCELLED',report.counts.cancelled]];const gap=10,width=(CW-gap*3)/4;
   stats.forEach(([label,value],i)=>{const x=M+i*(width+gap);page.drawRectangle({x,y:y-54,width,height:54,color:C.mint});text(label,x+10,y-15,7.2,body,C.muted);text(String(value),x+10,y-41,21,heading,C.teal);});y-=77;
   text('Current appointment status for the selected scheduled dates.',M,y,8.3,body,C.muted);y-=20;
  }
  tableHeader();
 }
 const widths=[25,55,165,90,115,CW-450],labels=['#','TOKEN','PATIENT','VISIT DATE','STATUS','EARLIER ALERTS'];
 function tableHeader(){page.drawRectangle({x:M,y:y-24,width:CW,height:24,color:C.teal});let x=M;labels.forEach((label,i)=>{text(label,x+6,y-15,7.4,body,C.white);x+=widths[i];});y-=24;}
 newPage(true);
 if(!report.rows.length){page.drawRectangle({x:M,y:y-78,width:CW,height:78,color:C.mist});text('No appointments match this report.',M+15,y-29,11,heading);text('Try another date range or choose All statuses.',M+15,y-49,9,body,C.muted);y-=100;}
 for(const [index,row] of report.rows.entries()){
  const nameFont=fontFor(row.name),names=line(row.name,widths[2]-12,nameFont,9.2);const height=Math.max(29,names.length*12+13);
  if(y-height<78)newPage(false);
  if(index%2===0)page.drawRectangle({x:M,y:y-height,width:CW,height,color:C.mist});
  const values=[String(index+1),row.token,null,formatDate(row.date),row.status,row.optIn?'Yes':'No'];let x=M;
  for(let col=0;col<values.length;col++){
   if(col===2){for(const [n,name] of names.entries()){const nameX=nameFont===arabic?x+widths[col]-6-nameFont.widthOfTextAtSize(name,9.2):x+6;text(name,nameX,y-18-n*12,9.2,nameFont);}}
   else text(values[col],x+6,y-18,col===4?8.6:9.1,body,col===1?C.teal:C.navy);
   x+=widths[col];
  }
  page.drawLine({start:{x:M,y:y-height},end:{x:W-M,y:y-height},thickness:.4,color:C.line});y-=height;
 }
 if(y<125)newPage(false);
 y-=25;text('Absent: '+report.counts.absent+'   |   Reported appointments: '+report.counts.total,M,y,8.5,body,C.muted);y-=17;
 wrap('This is an internal appointment register, not a diagnosis, treatment or payment report.',M,y,CW,8,body,C.muted);
 if(substitutions)wrap('Unsupported symbols are shown as Unicode codes, for example [U+1F600].',M,y-28,CW,7.5,body,C.muted);
 const pages=pdf.getPages();for(const [i,p] of pages.entries()){p.drawLine({start:{x:M,y:43},end:{x:W-M,y:43},thickness:.6,color:C.line});p.drawText('INTERNAL CLINIC OPERATIONS  /  CONFIDENTIAL',{x:M,y:28,size:7.2,font:body,color:C.muted});const label=`Page ${i+1} of ${pages.length}`;p.drawText(label,{x:W-M-body.widthOfTextAtSize(label,8),y:28,size:8,font:body,color:C.muted});}
 pdf.setTitle('ClinicFlow appointment report - '+report.from+' to '+report.to);pdf.setAuthor('WMP ClinicFlow');pdf.setSubject('Internal clinic appointment register');pdf.setCreationDate(new Date(report.generatedAt));
 return pdf.save();
}
