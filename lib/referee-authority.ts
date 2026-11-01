export type AppointmentTier=0|1|2;
export type AppointmentState='confirmed'|'unconfirmed'|'stale'|'unavailable'|'completed';

const OFFICIAL_HOSTS=['premierleague.com','dfb.de','legaseriea.it','aia-figc.it','figc.it','rfef.es','laliga.com','uefa.com','lfp.fr','ligue1.com','fff.fr','tff.org','fpf.pt','ligaportugal.pt'];
const OFFICIAL_LABEL=/официальн(?:ое|ая)\s+(?:сообщение\s+о\s+)?назначение|official appointment/i;
const host=(url?:string)=>{try{return url?new URL(url).hostname.replace(/^www\./,''):''}catch{return ''}};

export function appointmentTier(value:any):AppointmentTier{
 if(!value)return 0;
 if(OFFICIAL_LABEL.test(String(value.appointmentType||'')))return 2;
 const h=host(value.appointmentSource||value.source);
 if(h&&OFFICIAL_HOSTS.some(o=>h===o||h.endsWith('.'+o))&&/назнач|appoint|officials|designa|schiedsrichter/i.test(String(value.appointmentType||'')+String(value.appointmentSource||value.source||'')))return 2;
 if(/espn/i.test(String(value.appointmentType||''))||/espn\./.test(h))return 1;
 return 0;
}

export const sameName=(a?:string|null,b?:string|null)=>{
 const clean=(s?:string|null)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z\s]/g,' ').trim().split(/\s+/).filter(Boolean);
 const x=clean(a),y=clean(b);if(!x.length||!y.length)return false;
 return x.join(' ')===y.join(' ')||(x.at(-1)===y.at(-1)&&x[0][0]===y[0][0]);
};
export function protectsAppointment(current:any,incoming:any){return !!current?.referee&&!!incoming?.referee&&appointmentTier(current)>appointmentTier(incoming)}
export function outranks(incoming:any,current:any){return !!incoming?.referee&&appointmentTier(incoming)>appointmentTier(current)}
export function conflictNote(current:any,incoming:any){
 if(!current?.referee||!incoming?.referee||sameName(current.referee,incoming.referee))return null;
 return {referee:incoming.referee,source:incoming.appointmentSource||incoming.source||null,type:incoming.appointmentType||null};
}

export function appointmentState(match:any):AppointmentState{
 if(!match?.referee)return 'unavailable';
 if(match.state==='post')return 'completed';
 if(match.appointmentStale||match.currentVerified===false)return 'stale';
 return appointmentTier(match)===2?'confirmed':'unconfirmed';
}
export const STATE_LABEL:Record<AppointmentState,{label:string,hint:string}>={
 confirmed:{label:'Подтверждено официально',hint:'Назначение опубликовано лигой или федерацией.'},
 unconfirmed:{label:'Не подтверждено официально',hint:'Имя получено из резервного источника ESPN.'},
 stale:{label:'Последнее подтверждённое назначение',hint:'Повторная проверка не удалась; сохранены прежнее имя и дата.'},
 unavailable:{label:'Нет данных',hint:'Источник ещё не передал имя арбитра.'},
 completed:{label:'Матч завершён',hint:'Арбитр, работавший на завершённом матче.'},
};

export function matchTtl(match:any,now=Date.now()){
 if(!match)return 60000;
 if(match.state==='in')return 30000;
 if(match.state==='post')return 10*60000;
 const kickoff=Date.parse(match.date||''),toKickoff=Number.isFinite(kickoff)?kickoff-now:Infinity;
 if(toKickoff<3*3600000)return 5*60000;
 if(match.referee&&appointmentTier(match)===2&&!match.appointmentStale)return 60*60000;
 if(match.referee)return 15*60000;
 return toKickoff>48*3600000?30*60000:60000;
}

export function logSourceError(source:string,error:unknown,context:Record<string,unknown>={}){
 try{console.warn('[cardroom:source]',JSON.stringify({source,error:String(error),at:new Date(Date.now()).toISOString(),...context}))}catch{}
}
