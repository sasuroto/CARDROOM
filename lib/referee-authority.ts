// Referee appointment source hierarchy.
// Official league/federation publications outrank ESPN; ESPN outranks saved
// snapshots with no source type. A lower tier can fill a missing name, but it can
// never replace a name published by a higher tier — including a stale official
// one, which keeps its original verification time and is labelled as stale.

export type AppointmentTier=0|1|2;
export type AppointmentState='confirmed'|'unconfirmed'|'stale'|'unavailable'|'completed';

export type Authority={league:string,authority:string,url:string,integration:'automatic'|'manual-verified'|'fallback-only',note:string};

// `integration` describes what this codebase actually does today, not what the
// authority could offer. None of these publishers provides a documented public API.
export const AUTHORITIES:Record<string,Authority>={
 epl:{league:'epl',authority:'Premier League / PGMOL',url:'https://www.premierleague.com/en/news',integration:'automatic',note:'Страница «Match officials for Matchweek N» разбирается автоматически раз в час; адрес статьи новой недели добавляется в pl-officials-snapshot.json.'},
 bundesliga:{league:'bundesliga',authority:'DFB',url:'https://datencenter.dfb.de/datencenter/bundesliga',integration:'manual-verified',note:'Назначения DFB Datencenter вносятся после ручной проверки (current-match-updates.json).'},
 seriea:{league:'seriea',authority:'Lega Serie A / AIA',url:'https://www.aia-figc.it/designazioni/',integration:'manual-verified',note:'Designazioni AIA вносятся после ручной проверки.'},
 laliga:{league:'laliga',authority:'RFEF (CTA)',url:'https://rfef.es/es/noticias',integration:'manual-verified',note:'Designaciones RFEF вносятся после ручной проверки.'},
 segunda:{league:'segunda',authority:'RFEF (CTA)',url:'https://rfef.es/es/noticias',integration:'manual-verified',note:'Designaciones RFEF вносятся после ручной проверки.'},
 ucl:{league:'ucl',authority:'UEFA',url:'https://www.uefa.com/uefachampionsleague/',integration:'manual-verified',note:'Назначения UEFA вносятся после ручной проверки.'},
};
export const FALLBACK_SOURCE={authority:'ESPN',url:'https://www.espn.com/soccer/',note:'Резервный источник: имя из календаря или протокола ESPN. Не считается официальным подтверждением.'};

const OFFICIAL_HOSTS=['premierleague.com','dfb.de','legaseriea.it','aia-figc.it','figc.it','rfef.es','laliga.com','uefa.com','lfp.fr','fff.fr','tff.org','fpf.pt','ligaportugal.pt'];
const OFFICIAL_LABEL=/официальное назначение|official appointment/i;
const host=(url?:string)=>{try{return url?new URL(url).hostname.replace(/^www\./,''):''}catch{return ''}};

export function appointmentTier(value:any):AppointmentTier{
 if(!value)return 0;
 if(OFFICIAL_LABEL.test(String(value.appointmentType||'')))return 2;
 const h=host(value.appointmentSource||value.source);
 if(h&&OFFICIAL_HOSTS.some(o=>h===o||h.endsWith('.'+o))&&/назнач|appoint|officials|designa|schiedsrichter/i.test(String(value.appointmentType||'')+String(value.appointmentSource||value.source||'')))return 2;
 if(/espn/i.test(String(value.appointmentType||''))||/espn\./.test(h))return 1;
 return 0;
}

// "M. Oliver" and "Michael Oliver" are the same official; "Michael Oliver" and "Craig Pawson" are not.
export const sameName=(a?:string|null,b?:string|null)=>{
 const t=(s?:string|null)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z\s]/g,' ').trim().split(/\s+/).filter(Boolean);
 const x=t(a),y=t(b);if(!x.length||!y.length)return false;
 return x.join(' ')===y.join(' ')||(x.at(-1)===y.at(-1)&&x[0][0]===y[0][0]);
};

// Returns true when `incoming` must not replace the appointment already on `current`.
export function protectsAppointment(current:any,incoming:any){
 if(!current?.referee||!incoming?.referee)return false;
 return appointmentTier(current)>appointmentTier(incoming);
}
export function outranks(incoming:any,current:any){
 return !!incoming?.referee&&appointmentTier(incoming)>appointmentTier(current);
}
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
 confirmed:{label:'Подтверждено официально',hint:'Назначение опубликовано лигой или федерацией и проверено в указанное время.'},
 unconfirmed:{label:'Не подтверждено официально',hint:'Имя получено из резервного источника (ESPN). Официальная публикация лиги ещё не сверена.'},
 stale:{label:'Устарело',hint:'Повторная проверка источника не удалась. Показано последнее подтверждение с исходным временем.'},
 unavailable:{label:'Нет данных',hint:'Источник ещё не передал имя арбитра. Это не означает, что судья не назначен.'},
 completed:{label:'Матч завершён',hint:'Арбитр, который работал на этом матче. Не является назначением на будущие игры.'},
};

// Cache lifetime for /api/match: live score while the match runs, frequent
// appointment checks in the last hours, hourly once an official name is confirmed.
export function matchTtl(match:any,now=Date.now()){
 if(!match)return 60000;
 if(match.state==='in')return 30000;
 if(match.state==='post')return 10*60000;
 const kickoff=Date.parse(match.date||'');const toKickoff=Number.isFinite(kickoff)?kickoff-now:Infinity;
 if(toKickoff<3*3600000)return 5*60000;
 if(match.referee&&appointmentTier(match)===2&&!match.appointmentStale)return 60*60000;
 if(match.referee)return 15*60000;
 return toKickoff>48*3600000?30*60000:60000;
}

// Structured source logging: visible in Worker logs, never shown raw to users.
export function logSourceError(source:string,error:unknown,context:Record<string,unknown>={}){
 try{console.warn('[cardroom:source]',JSON.stringify({source,error:String(error),at:new Date(Date.now()).toISOString(),...context}))}catch{/* logging must not break a response */}
}
