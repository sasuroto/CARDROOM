import {mergeMatchStatus,statusCheckedAt} from './match-status-evidence';
import {logoUrl} from './team-logo';
import {normalizeMatchLocation} from './match-location';
import {protectsAppointment,outranks,conflictNote,appointmentTier} from './referee-authority';

export function latestMatchView(match:any,analysis:any){
 const analysisTime=Date.parse(analysis?.checkedAt||''),calendarTime=Date.parse(statusCheckedAt(match)||'');
 const useAnalysis=!!analysis?.state&&Number.isFinite(analysisTime)&&(!Number.isFinite(calendarTime)||analysisTime>=calendarTime);
 const home=analysis?.teams?.find((t:any)=>t.side==='home'),away=analysis?.teams?.find((t:any)=>t.side==='away');
 return {state:useAnalysis?analysis.state:match.state,homeScore:useAnalysis?home?.score:match.homeScore,awayScore:useAnalysis?away?.score:match.awayScore,clock:useAnalysis?analysis.clock:null};
}

export function withAppointment(match:any,details:any){
 if(!details||(details.id&&String(details.id)!==String(match.id))||(details.league&&details.league!==match.league))return match;
 const out={...mergeMatchStatus(match,details)};
 const candidate=details.dossier,prior=out.dossier;
 const sameKickoff=(d:any)=>d&&d.id===String(match.id)&&d.league===match.league&&Number.isFinite(Date.parse(d.kickoff||''))&&Date.parse(d.kickoff)===Date.parse(out.date||match.date||'');
 if(!sameKickoff(prior))out.dossier=null;
 if(sameKickoff(candidate)&&Number.isFinite(Date.parse(candidate.fetchedAt||''))&&(!out.dossier||Date.parse(candidate.fetchedAt)>=Date.parse(typeof out.dossier==='object'&&'fetchedAt' in out.dossier?String(out.dossier.fetchedAt||''):''))){out.dossier=candidate;out.dossierError=details.dossierError||null;}
 else if(details.dossierError)out.dossierError=details.dossierError;
 for(const field of ['homeLogo','awayLogo']){const logo=logoUrl(details[field]);if(logo)out[field]=logo;}
 for(const field of ['venue','city','country'])if(details[field])out[field]=details[field];
 const changedLocation=['venue','city','country'].some(field=>details[field]&&details[field]!==match[field]);
 if(changedLocation||details.venueCitySource)for(const field of ['venueCityOriginal','venueCitySource'])out[field]=details[field]||null;
 const protectedOfficial=protectsAppointment(match,details),higher=outranks(details,match);
 const older=protectedOfficial||(!higher&&match.referee&&Date.parse(details.appointmentCheckedAt||details.checkedAt||'')<Date.parse(match.appointmentCheckedAt||''));
 if(protectedOfficial)out.appointmentConflict=conflictNote(match,details)||null;
 if(details.referee&&!older){
  if(higher||details.referee!==match.referee)for(const field of ['assistants','videoOfficials','var','avar','fourthOfficial','crewSource','crewCheckedAt','crewLastAttemptAt','crewNextCheckAt','crewError','crewComplete','crewPersisted'])out[field]=null;
  out.appointmentConflict=details.appointmentConflict||(higher?conflictNote(details,match):match.appointmentConflict)||null;
  for(const field of (details.crewSource?['referee']:['referee','assistants','videoOfficials','var','avar','fourthOfficial']))if(details[field]&&(!Array.isArray(details[field])||details[field].length))out[field]=details[field];
  out.appointmentSource=details.appointmentSource||details.source||match.appointmentSource;
  out.appointmentCheckedAt=details.appointmentCheckedAt||details.checkedAt||match.appointmentCheckedAt;
  out.appointmentType=details.appointmentType||match.appointmentType;
  out.appointmentStale=!!(details.appointmentStale??details.stale);
  out.currentVerified=!out.appointmentStale&&(details.currentVerified??true);
  out.appointmentError=details.appointmentError||null;
  if(details.crewSource){
   const sameDate=typeof out.date==='string'&&Date.parse(details.date||'')===Date.parse(out.date);
   const newerCrew=!out.crewLastAttemptAt||(typeof out.crewLastAttemptAt==='string'&&Date.parse(details.crewLastAttemptAt||'')>=Date.parse(out.crewLastAttemptAt));
   if(sameDate&&newerCrew){
    for(const field of ['crewSource','crewCheckedAt','crewLastAttemptAt','crewNextCheckAt','crewStale','crewError','crewPersisted','crewComplete'])out[field]=details[field];
    if(details.crewCheckedAt)for(const field of ['assistants','var','avar','fourthOfficial'])out[field]=details[field]??null;
   }
  }
 }else if(!details.referee&&match.referee&&details.lastAttemptAt&&!(appointmentTier(match)===2&&appointmentTier(details)<2)){
  out.appointmentStale=true;out.currentVerified=false;out.appointmentError=details.error||'Свежий ответ не подтвердил сохранённое назначение.';
 }
 const diagnosticStamp=details.appointmentDiagnosticAt||details.appointmentLastAttempt||details.lastAttemptAt||details.fetchedAt,diagnosticAt=Date.parse(diagnosticStamp||''),priorDiagnosticAt=Date.parse(match.appointmentDiagnosticAt||match.appointmentLastAttempt||'');
 const olderDiagnostic=!out.referee&&Number.isFinite(priorDiagnosticAt)&&(!Number.isFinite(diagnosticAt)||diagnosticAt<priorDiagnosticAt);
 if(!out.referee&&!older&&!olderDiagnostic){
  if(Number.isFinite(diagnosticAt))out.appointmentDiagnosticAt=diagnosticStamp;
  if(Object.prototype.hasOwnProperty.call(details,'appointmentError'))out.appointmentError=details.appointmentError;
  else if(details.error)out.appointmentError='Не удалось проверить назначение арбитра.';
 }
 if(!older&&!olderDiagnostic)out.appointmentLastAttempt=details.appointmentLastAttempt||details.lastAttemptAt||details.fetchedAt||match.appointmentLastAttempt;
 return normalizeMatchLocation(out);
}
