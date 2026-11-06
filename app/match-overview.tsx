'use client';
import {useState} from 'react';
import {MapPin,Clock,Flag} from 'lucide-react';
import {matchLocation} from '../lib/match-location';
import MatchWeather from './match-weather';
import {RefereeAppointmentBadge} from './referee-intelligence';

function Crest({src,name}:{src?:string,name:string}){
 const [failed,setFailed]=useState(false);
 return <span className="overviewCrest">{src&&!failed?<img src={src} alt={'Герб '+name} onError={()=>setFailed(true)}/>:<span aria-label={'Герб '+name+' недоступен'}>{name.slice(0,2).toUpperCase()}</span>}</span>;
}
const stamp=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):null;
export default function MatchOverview({match,leagueName,loading=false,titleId}:{match:any,leagueName?:string,loading?:boolean,titleId?:string}){
 const played=match.state==='in'||match.state==='post';
 const score=(v:any)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?String(v):'—';
 const status=match.state==='in'?'В игре':match.state==='post'?'Завершён':match.state==='pre'&&Date.parse(match.date)>Date.now()?'Предстоит':'Статус уточняется';
 const id=titleId||'match-overview-'+match.id,checked=stamp(match.checkedAt||match.fetchedAt),refChecked=stamp(match.appointmentCheckedAt),saved=match.appointmentStale;
 const kickoff=Number.isFinite(Date.parse(match.date))?new Date(match.date).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'Время уточняется';
 return <section className="matchOverview" aria-labelledby={id}>
  <div className="overviewTopline"><span className="overviewEyebrow">01 / МАТЧ</span><span>{leagueName||'Турнир уточняется'}</span><span className="overviewStatus">{status}{match.clock?' · '+match.clock:''}</span></div>
  <h2 id={id} className="overviewAccessibleTitle">{match.home} против {match.away}</h2>
  <div className="overviewTeams">
   <div className="overviewTeam"><Crest key={match.homeLogo||match.home} src={match.homeLogo} name={match.home}/><strong>{match.home}</strong><small>Хозяева</small></div>
   <div className="overviewVersus"><strong>{played?score(match.homeScore)+' : '+score(match.awayScore):'ПРОТИВ'}</strong><span>{played?'Счёт по источнику':'Начало'}{!played&&stamp(match.date)?' · '+new Date(match.date).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'}):''}</span>{!played&&<small>Тбилиси · UTC+4</small>}</div>
   <div className="overviewTeam"><Crest key={match.awayLogo||match.away} src={match.awayLogo} name={match.away}/><strong>{match.away}</strong><small>Гости</small></div>
  </div>
  <dl className="overviewDetails">
   <div className="overviewVenue"><dt><MapPin aria-hidden="true"/>Место проведения</dt><dd>{matchLocation(match)}</dd></div>
   <div className="overviewDateWeather"><dt><Clock aria-hidden="true"/>Дата и время</dt><dd>{kickoff}<small>Тбилиси · UTC+4</small></dd><dd className="overviewWeather"><MatchWeather id={String(match.id)} league={match.league}/></dd></div>
   <div className="overviewReferee"><dt><Flag aria-hidden="true"/>Главный арбитр</dt><dd>{match.referee||(loading?'Проверяю назначение…':'Имя пока не получено')}<RefereeAppointmentBadge match={match}/><small>{match.referee?(saved?'Сохранённое назначение':refChecked?'Подтверждено источником':'Дата подтверждения не указана')+(refChecked?' · '+refChecked+' · UTC+4':''):'Источник ещё не передал имя; это не означает, что судья не назначен.'}</small></dd>{match.referee&&match.appointmentType&&<small className="overviewAppointmentCheck">{match.appointmentType}</small>}{match.appointmentLastAttempt&&<small className="overviewAppointmentCheck">Проверка назначения: {stamp(match.appointmentLastAttempt)} · UTC+4</small>}{match.appointmentError&&<small className="overviewAppointmentCheck">{match.appointmentError}</small>}{match.referee&&(match.appointmentSource||match.source)&&<a href={match.appointmentSource||match.source} target="_blank" rel="noreferrer">Источник назначения ↗</a>}{[match.assistants?.length,match.var,match.avar,match.fourthOfficial].some(Boolean)&&<dd className="overviewOfficials"><details><summary>Судейская бригада</summary>{[['Ассистенты',match.assistants?.join(' · ')],['VAR',match.var],['Ассистент VAR',match.avar],['Резервный арбитр',match.fourthOfficial]].filter(([,value])=>value).map(([label,value])=><p key={label}><small>{label}</small>{value}</p>)}</details></dd>}</div>
  </dl>
  <div className="overviewSource">{checked?<span>Срез данных матча: {checked} · UTC+4</span>:<span>Время проверки данных пока не подтверждено</span>}{match.source&&<a href={match.source} target="_blank" rel="noreferrer">Источник матча ↗</a>}{match.stale&&<span>Сохранённые данные могут задерживаться.</span>}</div>
 </section>;
}
