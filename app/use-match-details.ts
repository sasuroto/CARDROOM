'use client';
import {useEffect,useState} from 'react';
import {withAppointment} from '../lib/fixture-display';

export function useMatchDetails(match:any,enabled=true){
 const [detail,setDetail]=useState<any>(null),[loading,setLoading]=useState(false);
 const id=match?.id,league=match?.league;
 useEffect(()=>{
  setDetail(null);if(!id||!league||!enabled)return;
  const controller=new AbortController();let pending=false,last=0;
  async function refresh(){
   if(pending||Date.now()-last<60000||document.visibilityState==='hidden')return;
   pending=true;last=Date.now();setLoading(true);
   try{const r=await fetch(`/api/match?id=${encodeURIComponent(id)}&league=${encodeURIComponent(league)}`,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(!controller.signal.aborted)setDetail((old:any)=>withAppointment(old||match,next))}
   catch{if(!controller.signal.aborted)setDetail((old:any)=>({...(old||match),appointmentStale:true,currentVerified:false,appointmentError:'Повторная проверка назначения недоступна.'}))}
   finally{pending=false;if(!controller.signal.aborted)setLoading(false)}
  }
  refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[id,league,enabled]);
 return {match:match&&enabled?withAppointment(match,detail):match,loading};
}
