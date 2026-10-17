export const calendarDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function calendarWindow(date:string,upcoming=false){
 const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+(upcoming?30:0));
 const until=end.toISOString().slice(0,10),prev=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
 const months:string[]=[],month=new Date(prev.slice(0,7)+'-01T12:00:00Z');while(month.toISOString().slice(0,7)<=until.slice(0,7)){months.push(month.toISOString().slice(0,7).replace('-',''));month.setUTCMonth(month.getUTCMonth()+1)}
 return {until,queries:upcoming?months:[date.replaceAll('-',''),prev.replaceAll('-','')]};
}
export function inCalendarScope(match:any,date:string,until:string,upcoming:boolean,now=Date.now()){
 const day=calendarDay(new Date(match.date));
 return upcoming?day>=date&&day<=until&&Date.parse(match.date)>now&&match.state!=='post':day===date;
}
