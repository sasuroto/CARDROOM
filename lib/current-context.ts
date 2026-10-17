import updates from './current-match-updates.json';
export function currentMatch(id:string){return updates.matches.find(m=>m.id===String(id))}
export function currentAppointment(id:string){
 const m=currentMatch(id);if(!m||m.appointmentStatus!=='confirmed')return null;
 const fresh=Date.now()-Date.parse(m.checkedAt)<24*60*60*1000&&Date.now()<Date.parse(m.date)+6*60*60*1000;
 return {id:m.id,league:m.league,date:m.date,home:m.home,away:m.away,...m.officials,checkedAt:m.checkedAt,source:m.source,appointmentSource:m.source,appointmentCheckedAt:m.checkedAt,appointmentType:m.appointmentType+(fresh?' · проверено вручную':' · сохранённый срез'),currentVerified:fresh,stale:!fresh};
}
