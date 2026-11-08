'use client';
import {useState} from 'react';
import {MapPin,Clock,Flag} from 'lucide-react';
import {matchLocation,normalizeMatchLocation} from '../lib/match-location';
import MatchWeather from './match-weather';
import {FavoriteButton} from './favorites';
import {normalizeScore,statusIsStale,statusCheckedAt} from '../lib/match-status-evidence';
import {panelStatus} from '../lib/match-status';
import {appointmentState,STATE_LABEL} from '../lib/referee-authority';

function Crest({src,name}:{src?:string,name:string}){
 const [failed,setFailed]=useState(false);
 return <span className="overviewCrest">{src&&!failed?<img src={src} alt={'Герб '+name} onError={()=>setFailed(true)}/>:<span aria-label={'Герб '+name+' недоступен'}>{name.slice(0,2).toUpperCase()}</span>}</span>;
}
const stamp=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):null;
export default function MatchOverview({match,leagueName,loading=false,titleId,compact=false}:{match:any,leagueName?:string,loading?:boolean,titleId?:string,compact?:boolean}){
 const providerStatus=panelStatus(match),played=providerStatus.showScore;
 const score=(v:any)=>{const value=normalizeScore(v);return value===null?'—':String(value)};
 const status=providerStatus.label;
 const id=titleId||'match-overview-'+match.id,checked=stamp(statusCheckedAt(match)),refChecked=stamp(match.appointmentCheckedAt),refState=STATE_LABEL[appointmentState(match)];
 const kickoff=Number.isFinite(Date.parse(match.date))?new Date(match.date).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'Время уточняется';
 const location=normalizeMatchLocation(match);
 const context=(<dl className="overviewDetails">
   <div className="overviewVenue"><dt><MapPin aria-hidden="true"/>Место проведения</dt><dd>{matchLocation(location)}{location.venueCitySource&&<small><a href={location.venueCitySource} target="_blank" rel="noreferrer">Источник города ↗</a></small>}</dd></div>
   <div className="overviewDateWeather"><dt><Clock aria-hidden="true"/>Дата и время</dt><dd>{kickoff}<small>Тбилиси · UTC+4</small></dd><dd className="overviewWeather"><MatchWeather id={String(match.id)} league={match.league}/></dd></div>
   <div className="overviewReferee"><dt><Flag aria-hidden="true"/>Главный арбитр</dt><dd>{match.referee||(loading?'Проверяю назначение…':'Имя пока не получено')}<small>{match.referee?refState.label+(refChecked?' · '+refChecked+' · UTC+4':''):match.appointmentError?'Проверка назначения не завершена; отсутствие имени не означает, что судья не назначен.':'Источник ещё не передал имя; это не означает, что судья не назначен.'}</small></dd>{match.referee&&match.appointmentType&&<small className="overviewAppointmentCheck">{match.appointmentType}</small>}{match.appointmentConflict&&<small className="overviewAppointmentCheck">ESPN указывает другого арбитра: {match.appointmentConflict.referee}. Приоритет у официального назначения.</small>}{match.appointmentLastAttempt&&<small className="overviewAppointmentCheck">Проверка назначения: {stamp(match.appointmentLastAttempt)} · UTC+4</small>}{match.appointmentError&&<small className="overviewAppointmentCheck">{match.appointmentError}</small>}{match.referee&&(match.appointmentSource||match.source)&&<a href={match.appointmentSource||match.source} target="_blank" rel="noreferrer">Источник назначения ↗</a>}{[match.assistants?.length,match.videoOfficials?.length,match.var,match.avar,match.fourthOfficial].some(Boolean)&&<dd className="overviewOfficials"><details><summary>Судейская бригада</summary>{[['Ассистенты',match.assistants?.join(' · ')],['VAR',match.var],['Ассистент VAR',match.avar],['Видеобригада (роли не уточнены)',match.videoOfficials?.join(' · ')],['Резервный арбитр',match.fourthOfficial]].filter(([,value])=>value).map(([label,value])=><p key={label}><small>{label}</small>{value}</p>)}</details></dd>}</div>
  </dl>);
 return <section className={'matchOverview'+(compact?' isCompact':'')} aria-labelledby={id}>
  <div className="overviewTopline"><span className="overviewEyebrow">01 / МАТЧ</span><span>{leagueName||'Турнир уточняется'}</span>{match.id&&match.league&&<span className="overviewFollow"><FavoriteButton kind="match" id={match.league+':'+match.id} label={match.home+' — '+match.away} league={match.league}/></span>}<span className="overviewStatus">{status}{providerStatus.minute?' · '+providerStatus.minute:''}</span></div>
  <h2 id={id} className="overviewAccessibleTitle">{match.home} против {match.away}</h2>
  <div className="overviewTeams">
   <div className="overviewTeam"><Crest key={match.homeLogo||match.home} src={match.homeLogo} name={match.home}/><strong>{match.home}</strong><small>Хозяева</small></div>
   <div className="overviewVersus"><strong>{played?score(match.homeScore)+' : '+score(match.awayScore):'ПРОТИВ'}</strong><span>{played?'Счёт по источнику':'Начало'}{!played&&stamp(match.date)?' · '+new Date(match.date).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'}):''}</span>{!played&&<small>Тбилиси · UTC+4</small>}</div>
   <div className="overviewTeam"><Crest key={match.awayLogo||match.away} src={match.awayLogo} name={match.away}/><strong>{match.away}</strong><small>Гости</small></div>
  </div>
  {compact?<details className="overviewContext" open><summary><span className="overviewContextLabel">Стадион, погода и арбитр <span className="overviewContextToggle" aria-hidden="true"/></span><span>{match.referee||'Имя арбитра не получено'}</span></summary>{context}</details>:context}
  <div className="overviewSource">{checked?<span>Срез данных матча: {checked} · UTC+4</span>:<span>Время проверки данных пока не подтверждено</span>}{match.statusSource&&<a href={match.statusSource} target="_blank" rel="noreferrer">Источник матча ↗</a>}{match.statusWarning&&<span>{match.statusWarning}</span>}{statusIsStale(match)&&<span>Сохранённые данные могут задерживаться.</span>}</div>
 </section>;
}
