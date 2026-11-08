'use client';
import {dailyStamp} from '../lib/daily-strip';
import {dailyCoverageSummary,dailyListMatches,dailyListStatus,type DailyCoverage,type DailyLeague} from '../lib/daily-list';
import {normalizeScore,type StatusRecord} from '../lib/match-status-evidence';
import {FavoriteStar,useFavorites} from './favorites';
type Props={events:StatusRecord[];leagues:DailyLeague[];today:string;league:string;now:number;loading:boolean;failed:boolean;coverage:DailyCoverage|null;stamp:string;onOpen:(match:StatusRecord)=>void};
export default function TodayAllLeagues({events,leagues,today,league,now,loading,failed,coverage,stamp,onOpen}:Props){
 const favorites=useFavorites(),matches=dailyListMatches(events,today,league,now);
 const scope=leagues.filter(item=>league==='all'||item.id===league),summary=dailyCoverageSummary(scope,coverage,today,failed);
 const names=new Map(leagues.map(item=>[item.id,item.name]));
 return <section id="today-all-leagues" className="dailyAllPanel" aria-labelledby="today-all-title">
  <div className="dailyAllHeading"><h3 id="today-all-title">Матчи сегодня · {matches.length}</h3><span>По времени начала · Тбилиси, UTC+4</span></div>
  <p className="dailyAllScope">Все подключённые лиги и турниры, включая еврокубки. Это не расписание всех лиг мира.</p>
  <p className="dailyAllCoverage" role="status">{loading?'Проверяю календарь. До окончания проверки показан имеющийся срез. ':failed?'Обновление недоступно. Сохранённые матчи оставлены, актуальность не подтверждена. ':''}{summary.incomplete?'Список может быть неполным. ':''}Календарь получен по {summary.received} из {summary.total} турниров.{stamp&&coverage?.date===today?' Последняя попытка · '+dailyStamp(stamp)+'.':''}</p>
  <details className="dailyAllSources"><summary>Покрытие и недоступные лиги</summary><ul>{summary.rows.map(row=><li key={row.id}><span>{row.name}</span><span>{row.state==='failed'?'Источник недоступен · сохранённые матчи могут быть неполными':row.state==='unavailable'?'Обновление недоступно · актуальность не подтверждена':row.state==='unchecked'?'Проверка не подтверждена':`В полученном расписании: ${matches.filter(match=>match.league===row.id).length}`}</span></li>)}</ul><p>Пустой ответ источника не гарантирует отсутствие игр. Даты и статусы отдельных матчей указаны ниже.</p></details>
  {!!matches.length&&<ul className="dailyAllMatches">{matches.map(match=>{
   const status=dailyListStatus(match,now,failed),id=String(match.league)+':'+String(match.id),favorite=favorites.has('match',id),home=String(match.home||'Команда не указана'),away=String(match.away||'Команда не указана');
   const kickoff=new Date(String(match.date)).toLocaleTimeString('ru-RU',{timeZone:'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'});
   const score=status.showScore?`${normalizeScore(match.homeScore)??'—'} : ${normalizeScore(match.awayScore)??'—'}`:null;
   return <li key={id} className={'dailyAllMatch'+(status.live?' isLive':'')}>
    <button className="dailyAllOpen" onClick={()=>onOpen(match)} aria-label={`${home} — ${away}. ${names.get(String(match.league))||String(match.league)}. ${kickoff}, Тбилиси. ${status.label}.${score?' Счёт '+score+'.':''} ${status.provenance}. Открыть матч`}>
     <time dateTime={String(match.date)}>{kickoff}</time><span className="dailyAllTeams"><small>{names.get(String(match.league))||String(match.league)}</small><strong>{home} — {away}</strong><small>{status.provenance}</small></span>
     <span className="dailyAllResult"><b>{status.label}</b>{score&&<strong>{score}</strong>}</span>
    </button>
    <button className="dailyAllFavorite" disabled={!favorites.ready} aria-pressed={favorite} aria-label={`${favorite?'Убрать с главного экрана':'Добавить на главный экран'}: ${home} — ${away}`} onClick={()=>favorites.toggle('match',id,home+' — '+away,String(match.league))}><FavoriteStar active={favorite}/></button>
   </li>;
  })}</ul>}
  {!matches.length&&<p className="dailyAllEmpty">{loading?'Загружаю матчи за сегодня…':summary.incomplete?'Матчи пока не получены. Это не означает, что сегодня игр нет.':'В полученном расписании на сегодня матчей нет.'}</p>}
 </section>;
}
