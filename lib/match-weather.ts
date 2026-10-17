// Letters without a decomposed form (Turkish ı, German ß, Nordic ø, Polish ł) are folded explicitly.
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ı/g,'i').replace(/ß/g,'ss').replace(/[øœ]/g,'o').replace(/æ/g,'ae').replace(/ł/g,'l').replace(/[^a-z0-9]/g,'');
const countries:Record<string,string>={england:'GB',scotland:'GB',wales:'GB',northernireland:'GB',unitedkingdom:'GB',spain:'ES',italy:'IT',france:'FR',germany:'DE',portugal:'PT',turkey:'TR',turkiye:'TR',netherlands:'NL',belgium:'BE',austria:'AT',switzerland:'CH',greece:'GR',denmark:'DK',norway:'NO',sweden:'SE',finland:'FI',poland:'PL',czechrepublic:'CZ',czechia:'CZ',croatia:'HR',serbia:'RS',slovenia:'SI',slovakia:'SK',romania:'RO',hungary:'HU',bulgaria:'BG',ukraine:'UA',cyprus:'CY',ireland:'IE',iceland:'IS',albania:'AL',georgia:'GE',azerbaijan:'AZ',kazakhstan:'KZ',israel:'IL',bosniaandherzegovina:'BA',northmacedonia:'MK',lithuania:'LT',latvia:'LV',estonia:'EE',luxembourg:'LU',malta:'MT',moldova:'MD',montenegro:'ME',faroeislands:'FO',kosovo:'XK'};
export const weatherCountry=(country:string)=>countries[normalize(country)]||(/^[a-z]{2}$/i.test(country)?country.toUpperCase():null);
// AS Monaco plays in Ligue 1, so ESPN lists France, but Stade Louis II is in Monaco (ISO MC).
export const weatherGeoCountry=(city:string,country:string)=>normalize(city)==='monaco'&&weatherCountry(country)==='FR'?'MC':weatherCountry(country);
// Zubieta's city is Donostia / San Sebastián (Gipuzkoa), not the homonymous villages.
// Verified: https://www.realsociedad.eus/en/club/facilities and GeoNames ID 3110044.
// Real Sociedad's Reale Arena (Anoeta) is in the same city: https://www.realsociedad.eus/en/club/stadium
const isZubieta=(city:string,country:string,venue='')=>weatherCountry(country)==='ES'&&normalize(city)==='sansebastian'&&/zubieta|realearena|anoeta/.test(normalize(venue));
// Names the English geocoder indexes differently, scoped by country so homonyms elsewhere are untouched.
// Exonyms (Venezia → Venice) and club/province names that are not the host municipality:
// Villarreal CF plays in Vila-real (Castellón), Kocaelispor in İzmit (Kocaeli province).
const aliases:Record<string,string>={'IT:venezia':'Venice','IT:milano':'Milan','IT:roma':'Rome','IT:napoli':'Naples','IT:torino':'Turin','IT:firenze':'Florence','IT:genova':'Genoa','IT:mantova':'Mantua','IT:padova':'Padua','PT:lisboa':'Lisbon','ES:sevilla':'Seville','ES:villarreal':'Vila-real','DE:munchen':'Munich','DE:koln':'Cologne','DE:nurnberg':'Nuremberg','TR:kocaeli':'İzmit','BE:brugge':'Bruges'};
export const weatherCityQuery=(city:string,country:string,venue='')=>isZubieta(city,country,venue)?'Donostia':aliases[weatherCountry(country)+':'+normalize(city)]||city;
const MAJOR=/^PPL(C|A\d?)$/;
const significant=(r:any)=>MAJOR.test(r.feature_code||'')||(Number(r.population)||0)>=10000;
export function selectWeatherCity(results:any[],city:string,country:string,venue=''){
 const code=weatherGeoCountry(city,country),query=weatherCityQuery(city,country,venue),names=new Set([normalize(aliases[code+':'+normalize(city)]?query:city),normalize(query)]);
 const candidates=results.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&r.feature_code?.startsWith('PPL')&&(code?r.country_code===code:normalize(r.country||'')===normalize(country))&&(isZubieta(city,country,venue)?r.id===3110044:names.has(normalize(r.name||''))));
 if(candidates.length<=1)return candidates[0]||null;
 // Homonyms are common (Berlin also names hamlets). Accept only one clearly dominant
 // populated place: a single major settlement, or one at least 10x larger than the rest.
 const major=candidates.filter(significant);
 if(major.length===1)return major[0];
 if(major.length>1){const ranked=[...major].sort((a,b)=>(Number(b.population)||0)-(Number(a.population)||0)),top=Number(ranked[0].population)||0,next=Number(ranked[1].population)||0;if(top>0&&top>=next*10)return ranked[0]}
 return null;
}
// ESPN occasionally joins two place names ("Hamburg Norderstedt"); retry with the first one.
export const weatherCityFallback=(city:string)=>{const first=city.split(/\s+/)[0];return first&&first!==city&&first.length>2?first:null};
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

// MET Norway symbol_code → WMO weather code used by the UI.
export function metSymbolToWmo(symbol:string|undefined){
 const s=(symbol||'').replace(/_(day|night|polartwilight)$/,'');
 if(!s)return null;if(s.includes('thunder'))return 95;
 if(s==='clearsky')return 0;if(s==='fair')return 1;if(s==='partlycloudy')return 2;if(s==='cloudy')return 3;if(s==='fog')return 45;
 if(s.includes('sleet'))return 66;if(s.includes('snow'))return s.startsWith('heavy')?75:s.startsWith('light')?71:73;
 if(s.includes('rain'))return s.includes('showers')?(s.startsWith('heavy')?82:s.startsWith('light')?80:81):(s.startsWith('heavy')?65:s.startsWith('light')?61:63);
 return null;
}
// Convert MET Norway Locationforecast (complete) to the hourly shape weatherAtKickoff reads.
// Only hourly-resolution steps are kept, so a 6-hour block never poses as a kickoff-hour forecast.
export function metToHourly(json:any){
 const hourly:any={time:[],temperature_2m:[],apparent_temperature:[],wind_speed_10m:[],precipitation_probability:[],precipitation:[],weather_code:[]};
 const num=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v:null;
 for(const step of json?.properties?.timeseries||[]){
  const next=step?.data?.next_1_hours,instant=step?.data?.instant?.details,t=Date.parse(step?.time);
  if(!next||!instant||!Number.isFinite(t))continue;
  hourly.time.push(t/1000);hourly.temperature_2m.push(num(instant.air_temperature));hourly.apparent_temperature.push(num(instant.apparent_air_temperature));hourly.wind_speed_10m.push(num(instant.wind_speed));
  hourly.precipitation_probability.push(num(next.details?.probability_of_precipitation));hourly.precipitation.push(num(next.details?.precipitation_amount));hourly.weather_code.push(metSymbolToWmo(next.summary?.symbol_code));
 }
 return {hourly};
}
export const weatherSourceName=(url:string|undefined)=>url?.includes('met.no')?'MET Norway':url?.includes('open-meteo')?'Open-Meteo':'Источник прогноза';
