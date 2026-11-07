import {dotAvailability,dotFresh,dotLineupsConfirmed} from './dot-predict';
import {appointmentState} from './referee-authority';
export type DotFact={title:string;text:string;source:string;checkedAt:string};
const https=(v:unknown)=>{try{return typeof v==='string'&&new URL(v).protocol==='https:'}catch{return false}};
const recent=(at:string,now:number,age:number)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now&&now-Date.parse(at)<=age;
const names=(players:any[])=>players.filter(p=>p?.name).map(p=>p.name).join(', ');
// Report observed facts only. Never infer injury, motivation or a numerical effect.
export function dotContextFacts(match:any,analysis:any,context:any,error:string,loading:boolean,now:number):DotFact[]{
 const facts:DotFact[]=dotAvailability(context,match,now).map((a:any)=>({title:'Сообщение клуба · '+a.team,text:a.text,source:a.source,checkedAt:a.checkedAt}));
 const d=match?.dossier;
 const dossierFresh=!match.stale&&!match.error&&!match.statusStale&&!match.dossierError&&d?.id===String(match.id)&&d?.league===match.league&&Date.parse(d.kickoff)===Date.parse(match.date)&&d.source===`https://www.espn.com/soccer/match/_/gameId/${match.id}`&&recent(d.fetchedAt,now,15*60000);
 const confirmed=dossierFresh&&(d.teams||[]).length===2&&d.teams.every((t:any)=>t.lineup?.status==='source-confirmed'&&recent(t.lineup.checkedAt,now,15*60000)&&new Set(t.lineup.starters.map((p:any)=>p.id)).size===11);
 if(confirmed){
  for(const t of d.teams)if(names(t.lineup.starters))facts.push({title:'Стартовый состав · '+t.name,text:(t.lineup.formation?'Схема '+t.lineup.formation+'. ':'')+names(t.lineup.starters)+'.',source:d.source,checkedAt:t.lineup.checkedAt});
 }else if(!loading&&dotLineupsConfirmed(match,analysis,error,now)){
  for(const t of analysis.lineups){const players=names(t.players.filter((p:any)=>p.starter));if(players)facts.push({title:'Стартовый состав · '+t.team,text:players+'.',source:analysis.source,checkedAt:analysis.checkedAt})}
 }
 if(dossierFresh){
  for(const c of (d.changes||[]).filter((c:any)=>c.kind==='lineup'&&recent(c.observedAt,now,86400000))){
   const t=d.teams.find((t:any)=>t.id===c.teamId);if(!t)continue;
   facts.push({title:'Изменение стартового состава · '+t.name,text:`Добавлены: ${names(c.added)||'не указаны'}. Убраны: ${names(c.removed)||'не указаны'}. Изменение между двумя проверками источника; причина не сообщена.`,source:d.source,checkedAt:c.observedAt});
  }
  if(['in','post'].includes(d.state)&&d.events?.status==='source-confirmed'&&recent(d.events.checkedAt,now,15*60000))for(const e of d.events.items.filter((e:any)=>['red-card','yellow-red-card'].includes(e.type))){
   const t=d.teams.find((t:any)=>t.id===e.teamId);
   facts.push({title:e.label+(e.minute?' · '+e.minute:''),text:(names(e.participants)||'Имя не передано')+(t?' · '+t.name:'')+'.',source:d.source,checkedAt:d.events.checkedAt});
  }
 }
 if(appointmentState(match)==='confirmed'&&!match.stale&&!match.error&&!match.appointmentConflict&&https(match.appointmentSource)&&recent(match.appointmentCheckedAt,now,86400000)){
  facts.push({title:'Официальное назначение',text:'Главный арбитр — '+match.referee+'.',source:match.appointmentSource,checkedAt:match.appointmentCheckedAt});
 }
 // Limit histories to their actual coverage; never claim these are the last games in all competitions.
 if(!loading&&dotFresh(match,analysis,error,now))for(const t of analysis.history||[]){
  const team=analysis.teams?.find((x:any)=>String(x.id)===String(t.id));if(!team)continue;
  const events=(t.events||[]).filter((e:any)=>https(e.source)&&recent(e.checkedAt,now,86400000)&&Date.parse(e.date)<Date.parse(match.date)).sort((a:any,b:any)=>Date.parse(b.date)-Date.parse(a.date));
  const e=events[0],hours=e?(Date.parse(match.date)-Date.parse(e.date))/3600000:0;
  if(e&&hours>0&&hours<=96)facts.push({title:'Короткий интервал · '+team.name,text:`Между началами этой встречи и подтверждённой игры против ${e.opponent||'соперника'} — ${Math.floor(hours)} ч. Проверена только доступная история этого турнира; другие соревнования не учтены.`,source:e.source,checkedAt:e.checkedAt});
 }
 return facts;
}
