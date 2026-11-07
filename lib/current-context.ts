import updates from './current-match-updates.json';
export function currentMatch(id:string){return updates.matches.find(m=>m.id===String(id))}
export function currentAppointment(id:string){
 const m=currentMatch(id);if(!m||m.appointmentStatus!=='confirmed')return null;
 const fresh=Date.now()-Date.parse(m.checkedAt)<24*60*60*1000&&Date.now()<Date.parse(m.date)+6*60*60*1000;
 return {id:m.id,league:m.league,date:m.date,home:m.home,away:m.away,...m.officials,checkedAt:m.checkedAt,source:m.source,appointmentSource:m.source,appointmentCheckedAt:m.checkedAt,appointmentType:m.appointmentType+(fresh?' · проверено вручную':' · сохранённый срез'),currentVerified:fresh,stale:!fresh};
}

// An empty secondary feed cannot erase a recently verified official notice.
// Keep its actual verification time, and never apply it to a rescheduled fixture.
export function applyCurrentAppointment(match:any){
 const known=currentAppointment(String(match.id));
 if(!known?.currentVerified||known.league!==match.league||(match.date&&Date.parse(match.date)!==Date.parse(known.date)))return match;
 if(match.referee&&match.currentVerified&&!match.appointmentStale&&Date.parse(match.appointmentCheckedAt||match.checkedAt||'')>Date.parse(known.checkedAt))return match;
 const {referee,assistants,var:video,avar,fourthOfficial,videoOfficials}=known as any;
 const onlyMissingSecondary=match.error==='В свежем ответе нет имени арбитра. Сохранённое назначение повторно не подтверждено.';
 return {...match,...(onlyMissingSecondary?{stale:false,error:null}:{}),date:match.date||known.date,home:match.home||known.home,away:match.away||known.away,referee,assistants,var:video,avar,fourthOfficial,videoOfficials,appointmentSource:known.source,appointmentCheckedAt:known.checkedAt,appointmentType:known.appointmentType,appointmentStale:false,appointmentError:null,currentVerified:true};
}
