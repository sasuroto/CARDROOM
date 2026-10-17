const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const countries:Record<string,string>={england:'GB',scotland:'GB',wales:'GB',northernireland:'GB',unitedkingdom:'GB',spain:'ES',italy:'IT',france:'FR',germany:'DE',portugal:'PT',turkey:'TR',turkiye:'TR',netherlands:'NL',belgium:'BE',austria:'AT',switzerland:'CH',greece:'GR',denmark:'DK',norway:'NO',sweden:'SE',finland:'FI',poland:'PL',czechrepublic:'CZ',czechia:'CZ',croatia:'HR',serbia:'RS',slovenia:'SI',slovakia:'SK',romania:'RO',hungary:'HU',bulgaria:'BG',ukraine:'UA',cyprus:'CY',ireland:'IE',iceland:'IS',albania:'AL',georgia:'GE',azerbaijan:'AZ',kazakhstan:'KZ',israel:'IL',bosniaandherzegovina:'BA',northmacedonia:'MK',lithuania:'LT',latvia:'LV',estonia:'EE',luxembourg:'LU',malta:'MT',moldova:'MD',montenegro:'ME',faroeislands:'FO',kosovo:'XK'};
export const weatherCountry=(country:string)=>countries[normalize(country)]||(/^[a-z]{2}$/i.test(country)?country.toUpperCase():null);
// Zubieta's city is Donostia / San Sebastián (Gipuzkoa), not the homonymous villages.
// Verified: https://www.realsociedad.eus/en/club/facilities and GeoNames ID 3110044.
const isZubieta=(city:string,country:string,venue='')=>weatherCountry(country)==='ES'&&normalize(city)==='sansebastian'&&normalize(venue).includes('zubieta');
export const weatherCityQuery=(city:string,country:string,venue='')=>isZubieta(city,country,venue)?'Donostia':city;
export function selectWeatherCity(results:any[],city:string,country:string,venue=''){
 const code=weatherCountry(country);
 const candidates=results.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&r.feature_code?.startsWith('PPL')&&(code?r.country_code===code:normalize(r.country||'')===normalize(country))&&(isZubieta(city,country,venue)?r.id===3110044:normalize(r.name||'')===normalize(city)));
 return candidates.length===1?candidates[0]:null;
}
export function weatherWindow(date:string,now=Date.now()){
 const kickoff=Date.parse(date);if(!Number.isFinite(kickoff))return 'unknown-date';
 if(kickoff<now)return 'started';
 const last=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z')+16*86400000;
 return kickoff>=last?'outside-range':'available';
}
export function weatherAtKickoff(data:any,date:string){
 const times=data.hourly?.time;if(!Array.isArray(times)||!times.length)return null;
 const kickoff=Date.parse(date)/1000;let index=-1,distance=Infinity;
 times.forEach((t:any,i:number)=>{if(typeof t==='number'&&Math.abs(t-kickoff)<distance){distance=Math.abs(t-kickoff);index=i}});
 if(index<0||distance>1800)return null;
 const value=(key:string,min:number,max:number)=>{const n=data.hourly[key]?.[index];return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null};
 const apparentTemperature=value('apparent_temperature',-110,80),temperature=value('temperature_2m',-90,65),wind=value('wind_speed_10m',0,150),precipitationProbability=value('precipitation_probability',0,100),precipitation=value('precipitation',0,500),code=value('weather_code',0,99);
 if(temperature===null&&wind===null&&precipitationProbability===null&&precipitation===null)return null;
 return {forecastAt:new Date(times[index]*1000).toISOString(),temperature,apparentTemperature,wind,precipitationProbability,precipitation,code};
}
export function weatherDescription(code:number|null){
 if(code===0)return 'Ясно';if(code===1)return 'Преимущественно ясно';if(code===2)return 'Переменная облачность';if(code===3)return 'Пасмурно';
 if(code===45||code===48)return 'Туман';if([51,53,55].includes(code as number))return 'Морось';if([56,57,66,67].includes(code as number))return 'Ледяной дождь';
 if([61,63,65,80,81,82].includes(code as number))return 'Дождь';if([71,73,75,77,85,86].includes(code as number))return 'Снег';if([95,96,97,99].includes(code as number))return 'Гроза';return 'Условия уточняются';
}

// Previously fetched forecast may bridge a provider outage, with its original timestamp.
export function verifiedWeatherSnapshot(snapshot:any,match:any,now=Date.now()){
 const age=now-Date.parse(snapshot?.checkedAt||'');
 return snapshot?.status==='available'&&snapshot.city===match.city&&snapshot.country===match.country&&Date.parse(snapshot.kickoff)===Date.parse(match.date)&&age>=0&&age<=6*3600000?snapshot:null;
}

// Explicit stadium identity only; never infer venue coordinates from the home club.
export function weatherVenue(match:any){
 const latitude=match.venueLatitude,longitude=match.venueLongitude;
 if(typeof latitude==='number'&&typeof longitude==='number'&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)return {name:match.city,latitude,longitude,scope:'stadium',locationSource:match.source};
 if(normalize(match.venue||'')==='etihadstadium'&&normalize(match.city||'')==='manchester'&&weatherCountry(match.country||'')==='GB')return {name:'Manchester',latitude:53.48316,longitude:-2.20038,timezone:'Europe/London',scope:'stadium',locationSource:'https://www.openstreetmap.org/way/26329734'};
 return null;
}
