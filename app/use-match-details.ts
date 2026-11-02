'use client';
import {useEffect,useState} from 'react';
import {detailPollDelay} from '../lib/match-status';
import {withAppointment} from '../lib/fixture-display';

export function useMatchDetails(match:any,enabled=true){
 const [detail,setDetail]=useState<any>(null),[pendingKey,setPendingKey]=useState<string|null>(null);
 const id=match?.id,league=match?.league,key=id&&league?String(league)+':'+String(id):'';
 useEffect(()=>{
  if(!id||!league||!enabled)return;
  const controller=new AbortController();let pending=false,last=0,latest=match;
  async function refresh(){
   if(pending||last>0&&Date.now()-last<detailPollDelay(latest)||document.visibilityState==='hidden')return;
   pending=true;last=Date.now();setPendingKey(key);
   try{const r=await fetch(`/api/match?id=${encodeURIComponent(id)}&league=${encodeURIComponent(league)}&evidence=1`,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(!controller.signal.aborted){latest=withAppointment(latest,next);setDetail((old:any)=>({key,value:old?.key===key&&old.value?withAppointment(old.value,next):next,failed:false}))}}
   catch{if(!controller.signal.aborted)setDetail((old:any)=>({key,value:old?.key===key?old.value:null,failed:true}))}
   finally{pending=false;if(!controller.signal.aborted)setPendingKey(null)}
  }
  refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[id,league,key,enabled]);
 const current=detail?.key===key?detail:null;
 const merged=match&&enabled?withAppointment(match,current?.value):match;
 return {match:merged&&enabled&&current?.failed?{...merged,appointmentStale:true,currentVerified:false,appointmentError:'Повторная проверка назначения недоступна.',statusStale:true,statusError:'Повторная проверка счёта и статуса недоступна.'}:merged,loading:!!enabled&&!!key&&pendingKey===key};
}
