import { DNotifier } from '@dnotifier-realtime/dnotifier';
import WebSocket from 'ws';

// Both SDK clients stay on the server: no application secret reaches a browser.
export class NotifierBridge {
  constructor(clinic,onDelivery){this.clinic=clinic;this.onDelivery=onDelivery;this.status={configured:!!(process.env.DNOTIFIER_APP_ID&&process.env.DNOTIFIER_APP_SECRET),connected:false,aiEnabled:false,sent:0,received:0,lastDelivery:null,error:null};this.busy=false;}
  async connect(){
    this.lastConnect=Date.now();
    if(!this.status.configured)return;
    const base={appId:process.env.DNOTIFIER_APP_ID,secret:process.env.DNOTIFIER_APP_SECRET,WebSocketImpl:WebSocket,logs:false,onMessage:()=>{},onDisconnected:()=>{this.status.connected=false;}};
    try {
      this.sender?.transport?.close?.();this.receiver?.transport?.close?.();
      this.receiver=new DNotifier({...base,transport:'ws',userId:'clinicflow-delivery',onConnected:()=>{},onMessage:msg=>{try{const p=msg.payload.toJSON();if(p?.type!=='clinicflow-event'||!p.eventId)return;this.clinic.atomic(()=>{const item=this.clinic.state.outbox.find(x=>x.id===p.eventId);if(item)this.clinic.state.outbox=this.clinic.state.outbox.filter(x=>x.id!==item.id);});this.status.received++;this.status.lastDelivery=Date.now();this.onDelivery(p);}catch{this.status.error='A delivery could not be processed.';}}});
      this.sender=new DNotifier({...base,transport:'ws',userId:'clinicflow-server',onConnected:()=>{}});
      await this.receiver.connect();await this.sender.connect();
      this.status.connected=!!(this.receiver.isConnected&&this.sender.isConnected);this.status.aiEnabled=!!this.sender.aiEnabled;this.status.error=null;
      console.log('DNotifier connection:',this.status.connected?'connected':'not ready','| AI:',this.status.aiEnabled?'enabled':'not enabled');
    }catch{this.status.error='DNotifier connection failed. Check credentials, subscription and network.';console.log(this.status.error);}
  }
  async flush(){this.status.connected=!!(this.sender?.isConnected&&this.receiver?.isConnected);if(!this.status.connected&&!this.busy&&this.status.configured&&Date.now()-(this.lastConnect||0)>30000){this.busy=true;try{await this.connect();}finally{this.busy=false;}return;}if(this.busy||!this.status.connected)return;this.busy=true;try{for(const e of this.clinic.state.outbox.slice(0,10)){await this.sender.send({senderId:'clinicflow-server',receiverId:'clinicflow-delivery',data:{type:'clinicflow-event',eventId:e.id,eventType:e.type},saveHistory:false});this.status.sent++;}}catch{this.status.error='Delivery pending; retrying when connected.';}finally{this.busy=false;}}
  async ask(question,context){
    if(!this.status.aiEnabled)throw Error('DNotifier AI is not enabled on this app. Reception help is available.');
    if(!this.ai){this.ai=new DNotifier({appId:process.env.DNOTIFIER_APP_ID,secret:process.env.DNOTIFIER_APP_SECRET,transport:'http',userId:'clinicflow-assistant',logs:false,onConnected:()=>{},onMessage:()=>{},onDisconnected:()=>{}});await this.ai.connect();}
    const workflow=new DNotifier.Workflow({name:'clinicflow-patient-help',description:'Answer administrative clinic questions using current authorized booking data',observability:true,async entry(ctx){return await ctx.sendAI({message:{...(process.env.DNOTIFIER_AI_PROVIDER?{provider:process.env.DNOTIFIER_AI_PROVIDER}:{}),...(process.env.DNOTIFIER_AI_MODEL?{model:process.env.DNOTIFIER_AI_MODEL}:{}),messages:[{role:'system',content:'You are ClinicFlow administrative help. Reply briefly in the language used, including Roman Urdu. Use ONLY the JSON clinic context below. Do not diagnose, recommend treatment or invent facts. If clinical or unknown, ask the patient to contact reception. You cannot change appointments. Queue wait estimates are approximate, and apply after check-in. Context: '+JSON.stringify(context)},{role:'user',content:question}]},saveHistory:false,label:'Administrative answer'});}});
    const result=await this.ai.runWorkflow({workflow,input:{question},senderId:'clinicflow-assistant'});
    const raw=result.result;const payload=raw?.data??raw?.payload??raw;const decoded=typeof payload?.toJSON==='function'?payload.toJSON():payload;
    if(decoded?.type==='error'){if(/provider is required/i.test(decoded.message||''))throw Error('DNotifier AI setup needed: select a provider and model in the DNotifier dashboard. Reception help is available.');throw Error('DNotifier AI could not answer. Check the provider/model configuration or contact reception.');}
    const answer=typeof decoded==='string'?decoded:decoded?.content??decoded?.text??decoded?.message?.content??decoded?.answer??decoded?.choices?.[0]?.message?.content;
    if(typeof answer!=='string'||!answer.trim())throw Error('AI did not return a readable answer. Please contact reception.');return answer;
  }
}
