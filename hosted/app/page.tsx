"use client";
import { useEffect } from 'react';
export default function ClinicFlow(){useEffect(()=>{const s=document.createElement('script');s.src='/app.js';s.async=true;document.body.appendChild(s);return()=>s.remove();},[]);return <><div id="app"><main style={{padding:40,fontFamily:'sans-serif'}}>Opening ClinicFlow…</main></div><div id="toast" role="status" aria-live="polite" /></>;}
