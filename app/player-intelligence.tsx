'use client';
import {useState} from 'react';
import intelligence from '../lib/player-intelligence.json';
import fixtures from '../lib/match-research.json';
import {normalizePlayer,type PlayerResearch,type PlayerInsight} from '../lib/player-intelligence-model';
const research=intelligence as PlayerResearch;
export function selectArchivedPlayers(players:PlayerInsight[]){
 const seen=new Set<string>(),teamCounts=new Map<string,number>();
 return players.filter(player=>{const id=normalizePlayer(player.name),team=normalizePlayer(player.team),count=teamCounts.get(team)||0;if(!id||!team||seen.has(id)||count>=3||(!teamCounts.has(team)&&teamCounts.size>=2))return false;seen.add(id);teamCounts.set(team,count+1);return true}).slice(0,6);
}
function archiveDate(value:string){const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' · Тбилиси (UTC+4)':'дата среза не указана'}
function Link({url,label}:{url:string;label:string}){return url?<a href={url} target="_blank" rel="noreferrer">{label} ↗</a>:null}
function PlayerCard({player,index,lineups}:{player:PlayerInsight;index:number;lineups?:any[]}){
 const teamLineup=lineups?.find(t=>normalizePlayer(t.team||'')===normalizePlayer(player.team));
 const entry=teamLineup?.players?.find((p:any)=>normalizePlayer(p.name||'')===normalizePlayer(player.name));
 const status=entry?.starter===true?'Состав этого матча (ESPN): в старте':entry?.starter===false?'Состав этого матча (ESPN): вне старта':'Состав этого матча не подтверждён в полученных данных';
 return <article className="playerInsight"><div className="playerInsightHeader"><span className="playerRank">{String(index+1).padStart(2,'0')}</span><div><small>{player.team} · {player.role}</small><h4>{player.name}</h4></div></div>
 <div className={'playerParticipation '+(entry?.starter===true?'confirmed':'')}>{status}</div>
 <p className="playerSelectionReason"><b>Основание архивной подборки: </b>{player.reason}</p>
 <div className="playerNumbers">{player.metrics.slice(0,4).map((m,i)=><div key={m.label+i}><span>{m.label}</span><strong>{m.value}</strong><small>{m.scope}</small><Link url={m.source} label="Источник"/></div>)}</div>
 <details className="playerStatsDetail"><summary>Вся найденная статистика · по турнирам</summary><div className="tableWrap"><table><thead><tr><th>ПОКАЗАТЕЛЬ</th><th>ЗНАЧЕНИЕ</th><th>ВЫБОРКА / ИСТОЧНИК</th></tr></thead><tbody>{player.metrics.map((m,i)=><tr key={m.label+i}><td>{m.label}</td><td><b>{m.value}</b></td><td>{m.scope}<br/><Link url={m.source} label="Источник"/></td></tr>)}</tbody></table></div><p className="definition">Показаны только найденные значения. Отсутствие показателя не означает ноль.</p></details>
 <div className="playerScenarios"><section className="playerUpside"><span>СИЛЬНАЯ СТОРОНА · АРХИВНАЯ ОЦЕНКА</span><b>{player.strength.likelihood}</b><p>{player.strength.text}</p></section><section className="playerDownside"><span>РИСК · АРХИВНАЯ ОЦЕНКА</span><b>{player.weakness.likelihood}</b><p>{player.weakness.text}</p></section></div>
 <details className="playerEvidence"><summary>Архив: факты, доступность и мнения болельщиков</summary><div className="playerAvailability"><b>Доступность и травмы на дату архивного среза</b><p>{player.availability.text}</p><p className="definition">Это сохранённое сообщение. Текущая травма, восстановление и доступность игрока по нему не подтверждаются.</p><Link url={player.availability.source} label="Открыть архивный источник"/></div>
 <ul>{player.facts.map((fact,i)=><li key={i}>{fact.text}{fact.scope&&<small>{fact.scope}</small>} <Link url={fact.source} label="Источник"/></li>)}</ul>
 <div className="playerFan"><span>МНЕНИЯ БОЛЕЛЬЩИКОВ{player.fan.date?' · '+player.fan.date:''}</span><p>{player.fan.text}</p><Link url={player.fan.source} label={player.fan.kind||'Открыть обсуждение'}/><small>Отдельные мнения из обсуждений; не опрос и не доказательство вероятности. Они не используются для расчёта процентов.</small></div>
 </details></article>
}
export default function PlayerIntelligence({matchId,lineups}:{matchId:string;lineups?:any[]}){
 const match=research.matches.find(m=>m.matchId===String(matchId));const [team,setTeam]=useState('all');
 if(!match)return null;
 const selected=selectArchivedPlayers(match.players),teams=[...new Set(selected.map(p=>p.team))],players=selected.filter(p=>team==='all'||p.team===team);
 return <section className="playerIntelligence" aria-label="Архив исследования игроков матча"><span className="eyebrow">PLAYER WATCH / АРХИВ</span><h3>Историческая подборка игроков</h3><p className="playerResearchIntro">{match.title} · {selected.length} игроков, не более 3 от каждой команды</p><p className="definition">Дата сохранённого исследования: {archiveDate(match.checkedAt)}. Факты и даты ниже не перепроверены заново. Место в списке отражает прежний порядок наблюдения, а не вероятность гола.</p>
 <div className="notice">Это архив предматчевого исследования. Его составы, травмы, оценки и мнения нельзя переносить на сегодняшний день. Сценарии условны; проверенной численной вероятности выступления нет. Период и турнир указаны у каждого показателя. Состав из ESPN, если загружен, относится только к выбранному матчу.</div>
 {selected.length<6&&<p className="definition">В архиве меньше шести подходящих записей. Недостающих игроков и их статистику не добавляем без источника.</p>}
 {match.note&&<p className="definition">{match.note}</p>}
 {!!match.fanDiscussion?.length&&<details className="playerEvidence"><summary>Архив обсуждений болельщиков перед матчем</summary>{match.fanDiscussion.map((f,i)=><div className="playerFan" key={i}><p>{f.text}</p><Link url={f.source} label="Открыть обсуждение"/></div>)}</details>}
 <div className="playerTeamFilters" aria-label="Фильтр по команде">{['all',...teams].map(t=><button key={t} aria-pressed={team===t} className={team===t?'active':''} onClick={()=>setTeam(t)}>{t==='all'?'Все игроки · '+selected.length:t}</button>)}</div>
 <div className="playerInsightList">{players.map(p=><PlayerCard key={p.team+p.name} player={p} index={selected.indexOf(p)} lineups={lineups}/>)}</div>
 </section>
}
export function hasPlayerIntelligence(matchId:string){return research.matches.some(m=>m.matchId===String(matchId))}

export function PlayerResearchDirectory({league='all'}:{league?:string}={}){
 const matches=research.matches.filter(m=>league==='all'||fixtures.fixtures.some(f=>String(f.id)===String(m.matchId)&&f.league===league));
 const [selected,setId]=useState(matches[0]?.matchId||'');
 const id=matches.find(m=>m.matchId===selected)?.matchId||matches[0]?.matchId||'';
 const count=matches.reduce((sum,m)=>sum+selectArchivedPlayers(m.players).length,0);
 if(!matches.length)return <div className="empty"><h3>Архив игроков этого турнира пока не собран</h3><p>Актуальные найденные минуты, составы и подборка игроков доступны в карточках матчей выше.</p></div>;
 return <section><div className="sectionHead"><div><span className="eyebrow">АРХИВ · МАТЧЕЙ: {matches.length} / ЗАПИСЕЙ ОБ ИГРОКАХ: {count}</span><h3>Исследования прошлых матчей</h3><p>Для актуальной подборки откройте карточку матча. Здесь сохранены прежние исследования с исходными датами и ограничениями.</p></div></div><label className="playerMatchSelect">Матч <select aria-label="Матч для исследования игроков" value={id} onChange={e=>setId(e.target.value)}>{matches.map(m=><option key={m.matchId} value={m.matchId}>{m.title}</option>)}</select></label><PlayerIntelligence key={id} matchId={id}/></section>
}
