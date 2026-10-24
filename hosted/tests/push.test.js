import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {buildPushPayload} from '@block65/webcrypto-web-push';
test('push encrypts a real browser payload with modern encoding and VAPID',async()=>{
 const server=createECDH('prime256v1');server.generateKeys();const device=createECDH('prime256v1');device.generateKeys();
 const body='A-001: appointment confirmed';const r=await buildPushPayload({data:{title:'ClinicFlow',body},options:{ttl:900,urgency:'high'}},{endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:device.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},{subject:'https://wmp-clinicflow.wmpsolution.chatgpt.site',publicKey:server.getPublicKey().toString('base64url'),privateKey:server.getPrivateKey().toString('base64url')});
 const h=new Headers(r.headers);assert.equal(h.get('content-encoding'),'aes128gcm');assert.match(h.get('authorization'),/^vapid /);assert.equal(r.method.toUpperCase(),'POST');assert.ok(!Buffer.from(r.body).includes(Buffer.from(body)));
});

