self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{let p={};try{p=event.data?.json()||{};}catch{p.body='Open ClinicFlow for your appointment update.';}event.waitUntil(self.registration.showNotification(p.title||'ClinicFlow',{body:p.body||'Your appointment has an update.',icon:'/brand/icon-192.png',badge:'/brand/icon-192.png',tag:p.tag||'clinicflow',data:{url:p.url||'/'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const u=new URL(event.notification.data?.url||'/',self.location.origin);if(u.origin!==self.location.origin)return;event.waitUntil(self.clients.openWindow(u.href));});
