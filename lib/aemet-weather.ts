import {readCache,writeCache} from './cache';

// AEMET's public municipal feed. No account or API key is required.
export const AEMET_XML='https://www.aemet.es/xml/municipios_h/localidad_h_08073.xml';
export const AEMET_SOURCE='https://www.aemet.es/es/eltiempo/prediccion/municipios/horas/tabla/cornella-de-llobregat-id08073';
const TTL=3600000,ZONE='Europe/Madrid';
const pending=new Map<string,Promise<any>>();
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
export function isRcde(match:any){return ['rcdestadium','rcdestadi','stagefrontstadium'].includes(norm(match.venue||''))&&['spain','es'].includes(norm(match.country||''))&&['barcelona','cornelladellobregat','cornelladellobregatbarcelona'].includes(norm(match.city||''))}
function localParts(date:string){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).map(p=>[p.type,p.value]))}
function localInstant(value:string){
 const raw=Date.parse(value+'Z');if(!Number.isFinite(raw))return null;
 const p=localParts(new Date(raw).toISOString()),offset=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:00:00Z`)-Math.floor(raw/3600000)*3600000;
 return new Date(raw-offset).toISOString();
}
export function parseAemet(xml:string,kickoff:string,now=Date.now()){
 if(!Number.isFinite(Date.parse(kickoff))||/<!DOCTYPE/i.test(xml)||!/<root\b[^>]*\bid="08073"/.test(xml))throw Error('Прогноз AEMET относится к другому муниципалитету');
 const issued=xml.match(/<elaborado>([^<]+)<\/elaborado>/)?.[1],sourceUpdatedAt=issued?localInstant(issued):null;
 if(!sourceUpdatedAt||Date.parse(sourceUpdatedAt)>now+60000||now-Date.parse(sourceUpdatedAt)>12*3600000)throw Error('Дата прогноза AEMET устарела или не подтверждена');
 const p=localParts(kickoff),day=`${p.year}-${p.month}-${p.day}`,hour=p.hour;
 const section=xml.match(new RegExp(`<dia\\b[^>]*fecha="${day}"[^>]*>([\\s\\S]*?)<\\/dia>`))?.[1];
 if(!section)throw Error('Нет прогноза AEMET на дату матча');
 const tag=(name:string,period=hour)=>section.match(new RegExp(`<${name}\\b[^>]*periodo="${period}"[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1];
 const number=(raw:string|undefined,min:number,max:number)=>{if(!raw?.trim()||!/^[-+]?\d+(?:\.\d+)?$/.test(raw.trim()))return null;const n=Number(raw);return n>=min&&n<=max?n:null};
 const temperature=number(tag('temperatura'),-90,65),apparentTemperature=number(tag('sens_termica'),-110,80),windKmh=number(tag('viento')?.match(/<velocidad>([^<]+)<\/velocidad>/)?.[1],0,540);
 if(temperature===null)throw Error('Нет температуры AEMET на час матча');
 let precipitationProbability:number|null=null,probabilityPeriod:string|null=null;
 for(const m of section.matchAll(/<prob_precipitacion\s+periodo="(\d{2})(\d{2})">([^<]*)<\/prob_precipitacion>/g)){
  const h=Number(hour),from=Number(m[1]),to=Number(m[2]);if(to>from?h>=from&&h<to:h>=from||h<to){precipitationProbability=number(m[3],0,100);probabilityPeriod=`${m[1]}:00–${m[2]}:00 · время Испании`;break}
 }
 const sky=tag('estado_cielo')?.replace(/n$/,'');
 const skyCodes:Record<string,number>={'11':0,'12':1,'13':2,'14':3,'15':3,'16':3,'17':2,'23':61,'24':61,'25':61,'26':61,'43':61,'44':61,'45':61,'46':61,'71':45,'72':45,'73':45};
 return {status:'available',temperature,apparentTemperature,wind:windKmh===null?null:windKmh/3.6,precipitation:number(tag('precipitacion'),0,500),precipitationProbability,probabilityPeriod,code:skyCodes[sky||'']??null,forecastAt:new Date(Math.floor(Date.parse(kickoff)/3600000)*3600000).toISOString(),sourceUpdatedAt,source:AEMET_SOURCE,sourceName:'AEMET',city:'Cornellà de Llobregat',country:'Spain',scope:'municipality',timezone:ZONE,latitude:41.35546934,longitude:2.07013202,locationSource:AEMET_SOURCE,kickoff};
}
export async function getAemetWeather(match:any,bucket:R2Bucket|undefined){
 if(!isRcde(match))return null;
 const key='weather/aemet/08073.json';
 let job=pending.get(key);if(!job){job=(async()=>{
  const cached=await readCache(bucket,key),now=Date.now();
  if(cached&&(Date.parse(cached.nextCheckAt||'')>now||now-Date.parse(cached.lastAttemptAt||cached.checkedAt)<TTL))return cached;
  const checkedAt=new Date(now).toISOString();
  try{
   const response=await fetch(AEMET_XML,{signal:AbortSignal.timeout(20000)});
   if(!response.ok){const retry=response.headers.get('Retry-After'),seconds=Number(retry),until=retry?(Number.isFinite(seconds)?now+seconds*1000:Date.parse(retry)):0;throw Object.assign(Error('AEMET: HTTP '+response.status),{retryAt:Math.max(now+TTL,until||0)})}
   const xml=await response.text();parseAemet(xml,match.date,now);
   const result={xml,checkedAt};await writeCache(bucket,key,result);return result;
  }catch(error){const result={...cached,lastAttemptAt:checkedAt,sourceError:error instanceof Error?error.message:'Ошибка AEMET',nextCheckAt:new Date(Math.max(now+TTL,(error as any)?.retryAt||0)).toISOString()};await writeCache(bucket,key,result);return result}
 })();pending.set(key,job);job.finally(()=>pending.delete(key));}
 const saved=await job;
 try{return {...parseAemet(saved.xml||'',match.date),checkedAt:saved.checkedAt,stale:!!saved.sourceError,...(saved.sourceError?{sourceError:saved.sourceError,nextCheckAt:saved.nextCheckAt,lastAttemptAt:saved.lastAttemptAt}:{})}}
 catch{return {status:'unavailable',message:'Прогноз AEMET временно недоступен',checkedAt:saved.checkedAt||saved.lastAttemptAt,sourceError:saved.sourceError||'Нет актуального прогноза на час матча',nextCheckAt:saved.nextCheckAt,source:AEMET_SOURCE,sourceName:'AEMET'}}
}
