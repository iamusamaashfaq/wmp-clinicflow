"use client";
import {useEffect} from 'react';
export default function WmpAdmin(){useEffect(()=>{const script=document.createElement('script');script.src='/admin.js';document.body.appendChild(script);return()=>script.remove();},[]);return <><div id="admin-app">Opening WMP workspace…</div><div id="toast" role="status" aria-live="polite"/></>;}
