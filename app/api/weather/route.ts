import {env} from 'cloudflare:workers';
import {LEAGUES} from '../../../lib/fixtures';
import {readCache,writeCache} from '../../../lib/cache';
import {weatherAtKickoff,weatherCountry,weatherWindow,weatherCityQuery,selectWeatherCity,verifiedWeatherSnapshot,weatherVenue} from '../../../lib/match-weather';
import snapshots from '../../../lib/weather-snapshot.json';
import {GET as getMatch} from '../match/route';
export const dynamic='force-dynamic';
const TTL=3600000,ERROR_TTL=300000,SOURCE='https://open-meteo.com/';
const running=new Map<string,Promise<any>>();
async function shared(key:string,load:()=>Promise<any>){
 const pending=running.get(key);if(pending)return pending;
 const job=load();running.set(key,job);try{return await job}finally{running.delete(key)}
}
const reply=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function upstream(url:string,bucket:R2Bucket|undefined){
 const key='weather/backoff/'+new URL(url).hostname,backoff=await readCache(bucket,key);
 if(backoff?.until>Date.now())throw Object.assign(Error('Источник ограничил запросы'),{retryAt:backoff.until});
 const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(response.status===429){const value=response.headers.get('Retry-After'),seconds=Number(value),until=value?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(value)):0;const retryAt=Math.max(Date.now()+TTL,until||0);await writeCache(bucket,key,{until:retryAt});throw Object.assign(Error(new URL(url).hostname+': HTTP 429'),{retryAt})}
 if(!response.ok)throw Error(new URL(url).hostname+': HTTP '+response.status);return response.json() as Promise<any>;
}
// Persist one hourly forecast series per coordinate/day. Different fixtures and
// kickoff hours reuse it; simultaneous requests within a Worker share one promise.
async function forecastAt(location:any,date:string,bucket:R2Bucket|undefined){
 const latitude=Number(location.latitude).toFixed(5),longitude=Number(location.longitude).toFixed(5),day=new Date(date).toISOString().slice(0,10);
 const key=`weather/forecast/v2/${latitude},${longitude}/${day}.json`;
 const saved=await shared(key,async()=>{
  const cached=await readCache(bucket,key),now=Date.now();
  if(cached&&(Date.parse(cached.nextCheckAt||'')>now||now-Date.parse(cached.lastAttemptAt||cached.checkedAt)<(cached.sourceError?ERROR_TTL:TTL)))return cached;
  const checkedAt=new Date(now).toISOString();
  try{
   const params=new URLSearchParams({latitude,longitude,hourly:'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m',wind_speed_unit:'ms',temperature_unit:'celsius',precipitation_unit:'mm',timezone:'GMT',timeformat:'unixtime',start_date:day,end_date:day});
   const data=await upstream('https://api.open-meteo.com/v1/forecast?'+params,bucket);
   if(!weatherAtKickoff(data,date))throw Error('Нет прогноза на час матча');
   const result={data,checkedAt};await writeCache(bucket,key,result);return result;
  }catch(error){
   const result={...cached,lastAttemptAt:checkedAt,sourceError:error instanceof Error?error.message:'Ошибка источника',nextCheckAt:new Date(Math.max(now+ERROR_TTL,(error as any)?.retryAt||0)).toISOString()};
   await writeCache(bucket,key,result);return result;
  }
 });
 const weather=weatherAtKickoff(saved.data||{},date);
 if(!weather)throw Object.assign(Error(saved.sourceError||'Нет прогноза на час матча'),{retryAt:Date.parse(saved.nextCheckAt||'')||0});
 return {...weather,checkedAt:saved.checkedAt,stale:!!saved.sourceError,...(saved.sourceError?{sourceError:saved.sourceError,lastAttemptAt:saved.lastAttemptAt,nextCheckAt:saved.nextCheckAt,message:'Сохранённый прогноз. Источник временно недоступен.'}:{})};
}
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,id=q.get('id')||'',league=q.get('league')||'';
 if(!/^\d{5,12}$/.test(id)||!LEAGUES[league]||[...q.keys()].some(k=>!['id','league'].includes(k)))return reply({status:'invalid',message:'Некорректный матч'},400);
 const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
 return reply(await shared(`match:${league}:${id}`,async()=>{
  const match:any=await(await getMatch(new Request(`https://cardroom.invalid/api/match?id=${id}&league=${league}`))).json();
  const state=weatherWindow(match.date);
  if(state!=='available')return {status:state,message:state==='started'?'Матч уже начался. Предматчевый прогноз не показывается.':state==='outside-range'?'Прогноз появится, когда до матча останется меньше 16 дней.':'Время матча пока не подтверждено.'};
  if(!match.city||!match.country)return {status:'unknown-location',message:'Прогноз появится после подтверждения города проведения.'};
  const city=match.city.split(',')[0].trim(),country=match.country,queryCity=weatherCityQuery(city,country,match.venue),locationIdentity=city+(queryCity!==city?'|'+queryCity:'');
  const locationKey=`weather/cities/v1/${encodeURIComponent(country)}/${encodeURIComponent(locationIdentity)}.json`;
  const identity=encodeURIComponent(match.date+'|'+locationIdentity+'|'+country),key=`weather/matches/v2/${league}/${id}/${identity}|${encodeURIComponent(match.venue||'')}.json`;
  const cached=await readCache(bucket,key),legacy=await readCache(bucket,`weather/matches/v1/${league}/${id}/${identity}.json`);
  const snapshot=verifiedWeatherSnapshot((snapshots as any)[league+':'+id],{...match,city});
  const retained=cached?.status==='available'?cached:legacy?.status==='available'?legacy:snapshot;
  if(cached&&(Date.parse(cached.nextCheckAt||'')>Date.now()||Date.now()-Date.parse(cached.lastAttemptAt||cached.checkedAt)<(cached.status==='unavailable'||cached.stale?ERROR_TTL:TTL)))return cached;
  const checkedAt=new Date(Date.now()).toISOString();
  try{
   let location:any=weatherVenue(match)||await readCache(bucket,locationKey);
   if(!location)location=await shared(locationKey,async()=>{
    const existing=await readCache(bucket,locationKey);if(existing)return existing;
    const params=new URLSearchParams({name:queryCity,count:'10',language:'en',format:'json'}),code=weatherCountry(country);if(code)params.set('countryCode',code);
    const geo=await upstream('https://geocoding-api.open-meteo.com/v1/search?'+params,bucket),found=selectWeatherCity(geo.results||[],city,country,match.venue);
    if(found)await writeCache(bucket,locationKey,found);return found;
   });
   if(!location){const missing={status:'unknown-location',message:'Город не удалось однозначно сопоставить с прогнозом.',checkedAt};await writeCache(bucket,key,missing);return missing}
   const weather=await forecastAt(location,match.date,bucket);
   const result={status:'available',...weather,city:location.name,country,timezone:location.timezone,scope:location.scope||'city',locationSource:location.locationSource||'https://www.geonames.org/',latitude:location.latitude,longitude:location.longitude,kickoff:match.date,source:SOURCE};
   await writeCache(bucket,key,result);return result;
  }catch(error){
   const sourceError=error instanceof Error?error.message:'Ошибка источника',nextCheckAt=new Date(Math.max(Date.now()+ERROR_TTL,(error as any)?.retryAt||0)).toISOString();
   const fallback=retained?{...retained,stale:true,lastAttemptAt:checkedAt,sourceError,nextCheckAt,message:'Сохранённый прогноз. Источник временно недоступен.'}:{status:'unavailable',checkedAt,lastAttemptAt:checkedAt,sourceError,nextCheckAt,message:'Прогноз временно недоступен'};
   await writeCache(bucket,key,fallback);return fallback;
  }
 }));
}
