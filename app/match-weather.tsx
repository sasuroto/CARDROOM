'use client';
import {useEffect,useState} from 'react';
import {Cloud,CloudRain,CloudSnow,CloudLightning,Sun,Wind,Droplets} from 'lucide-react';
import {weatherDescription} from '../lib/match-weather';
const number=(value:number|null,unit:string)=>typeof value!=='number'||!Number.isFinite(value)?'Нет данных':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value)+unit;
const stamp=(value:string)=>new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const pending=new Map<string,Promise<any>>();
function loadWeather(url:string){let job=pending.get(url);if(!job){job=fetch(url).then(r=>{if(!r.ok)throw Error();return r.json()}).finally(()=>pending.delete(url));pending.set(url,job)}return job}
export default function MatchWeather({id,league}:{id:string,league:string}){
 const [weather,setWeather]=useState<any>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setWeather(null);setLoading(true);
  async function load(){try{const data=await loadWeather(`/api/weather?id=${encodeURIComponent(id)}&league=${encodeURIComponent(league)}`);if(active)setWeather(data)}catch{if(active)setWeather((old:any)=>old?.status==='available'?{...old,stale:true,message:'Сохранённый прогноз. Источник временно недоступен.'}:{status:'unavailable',message:'Прогноз временно недоступен'})}finally{if(active)setLoading(false)}}
  load();const timer=setInterval(load,3600000);return()=>{active=false;clearInterval(timer)};
 },[id,league]);
 const code=weather?.code,Icon=code===0||code===1?Sun:[95,96,97,99].includes(code)?CloudLightning:[71,73,75,77,85,86].includes(code)?CloudSnow:[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)?CloudRain:Cloud,available=weather?.status==='available';
 return <section className="matchWeather matchWeatherCompact" aria-label="Погода к началу матча" aria-busy={loading}>
  <div className="weatherHeading"><span>ПОГОДА К НАЧАЛУ МАТЧА</span></div>
  {loading&&!weather?<p role="status">Проверяю прогноз…</p>:available?<>
   <div className="weatherMain"><Icon aria-hidden="true"/><div><strong>{number(weather.temperature,' °C')}</strong><span>{weatherDescription(code)}</span></div></div>
   <p className="weatherFeels">Ощущается {number(weather.apparentTemperature,' °C')}</p>
   <div className="weatherMiniMetrics"><span><Droplets aria-hidden="true"/><b>{number(weather.precipitationProbability,'%')}</b><small>Осадки</small></span><span><Wind aria-hidden="true"/><b>{number(weather.wind,' м/с')}</b><small>Ветер</small></span></div>
   {weather.stale&&<p className="sourceWarning">Сохранённый прогноз · {stamp(weather.checkedAt)} · UTC+4</p>}
  </>:<p className="weatherUnavailable">{weather?.message||'Прогноз временно недоступен'}</p>}
  {!loading&&<details className="weatherDetails"><summary>Подробности и источник</summary>
   {available&&<><p>{weather.scope==='stadium'?'Прогноз по координатам стадиона.':'Прогноз для города '+weather.city+'; точные координаты стадиона не подтверждены.'} Это прогноз, не измерение на поле.</p><p>Час прогноза: {stamp(weather.forecastAt)} · Тбилиси (UTC+4). Начало матча: {stamp(weather.kickoff)} · UTC+4.</p><p>Осадки за час: {number(weather.precipitation,' мм')}.</p><p>Получено {stamp(weather.checkedAt)} · UTC+4. Прогноз может измениться.</p><p><a href={weather.source} target="_blank" rel="noreferrer">Open-Meteo ↗</a> · <a href={weather.locationSource||'https://www.geonames.org/'} target="_blank" rel="noreferrer">{weather.locationSource?.includes('openstreetmap')?'© OpenStreetMap':'Источник координат'} ↗</a></p></>}
   {weather?.sourceError&&<p className="sourceWarning">{weather.sourceError.includes('429')||weather.sourceError.includes('ограничил')?'Источник ограничил запросы.':'Источник сейчас недоступен.'} {weather.nextCheckAt?'Следующая попытка не раньше '+stamp(weather.nextCheckAt)+' · UTC+4.':''}</p>}
   {!available&&!weather?.sourceError&&<p>Данные появятся после успешного ответа источника.</p>}
  </details>}
 </section>;
}
