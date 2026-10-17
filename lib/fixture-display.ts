export function latestMatchView(match:any,analysis:any){
 const analysisTime=Date.parse(analysis?.checkedAt||''),calendarTime=Date.parse(match?.checkedAt||'');
 const useAnalysis=!!analysis?.state&&Number.isFinite(analysisTime)&&(!Number.isFinite(calendarTime)||analysisTime>=calendarTime);
 const home=analysis?.teams?.find((t:any)=>t.side==='home'),away=analysis?.teams?.find((t:any)=>t.side==='away');
 return {state:useAnalysis?analysis.state:match.state,homeScore:useAnalysis?home?.score:match.homeScore,awayScore:useAnalysis?away?.score:match.awayScore,clock:useAnalysis?analysis.clock:null};
}

export function withAppointment(match:any,details:any){
 if(!details||(details.id&&String(details.id)!==String(match.id))||(details.league&&details.league!==match.league))return match;
 const out={...match};
 for(const field of ['venue','city','country'])if(details[field])out[field]=details[field];
 const older=match.referee&&Date.parse(details.appointmentCheckedAt||details.checkedAt||'')<Date.parse(match.appointmentCheckedAt||'');
 if(details.referee&&!older){
  for(const field of ['referee','assistants','videoOfficials','var','avar','fourthOfficial'])if(details[field]&&(!Array.isArray(details[field])||details[field].length))out[field]=details[field];
  out.appointmentSource=details.appointmentSource||details.source||match.appointmentSource;
  out.appointmentCheckedAt=details.appointmentCheckedAt||details.checkedAt||match.appointmentCheckedAt;
  out.appointmentType=details.appointmentType||match.appointmentType;
  out.appointmentStale=!!(details.appointmentStale??details.stale);
  out.currentVerified=!out.appointmentStale&&(details.currentVerified??true);
  out.appointmentError=details.appointmentError||null;
 }else if(!details.referee&&match.referee&&details.lastAttemptAt){
  out.appointmentStale=true;out.currentVerified=false;out.appointmentError=details.error||'Свежий ответ не подтвердил сохранённое назначение.';
 }
 if(!older)out.appointmentLastAttempt=details.appointmentLastAttempt||details.lastAttemptAt||details.fetchedAt||match.appointmentLastAttempt;
 return out;
}
