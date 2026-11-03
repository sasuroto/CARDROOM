// A transparent shortlist of existing scenarios, not a second probability model.
export const DOT_IDS = ['result','goals25','btts','home','away','corners95','yellow45','shots255','target95','fouls215'];
export function dotFamily(metric:string){
 if(['result','double','goals','home','away','btts','shots','target','saves','offsides'].includes(metric))return 'attack';
 if(['yellow','red','fouls'].includes(metric))return 'discipline';
 return metric==='corners'?'corners':null;
}
export function dotSelection(markets:any[],{pre,fresh,refereeEligible}:{pre:boolean;fresh:boolean;refereeEligible:boolean}){
 if(!pre||!fresh)return [];
 const seen=new Set<string>();
 return markets.filter(m=>DOT_IDS.includes(m.id)&&typeof m.p==='number'&&Number.isFinite(m.p)&&m.p>=.65&&m.p<1&&m.n>=3&&m.param&&[m.param.mean,m.param.homeMean,m.param.awayMean].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&!!m.param.source&&(dotFamily(m.metric)!=='discipline'||refereeEligible))
 .sort((a,b)=>b.p-a.p||a.id.localeCompare(b.id)).filter(m=>{const family=dotFamily(m.metric);if(!family||seen.has(family))return false;seen.add(family);return true}).slice(0,3);
}
export function dotFresh(match:any,analysis:any,error:string,now=Date.now()){
 const checked=Date.parse(analysis?.checkedAt||'');
 return !error&&!match?.stale&&!match?.error&&!analysis?.stale&&!analysis?.errors?.length&&Number.isFinite(checked)&&checked<=now&&now-checked<=15*60000&&Date.parse(analysis?.date)===Date.parse(match?.date)&&analysis?.source===`https://www.espn.com/soccer/match/_/gameId/${match.id}`;
}
export function dotAvailability(context:any,match:any,now=Date.now()){
 if(context?.id!==String(match.id)||context?.league!==match.league||Date.parse(context?.date)!==Date.parse(match.date))return [];
 return (context.availability||[]).filter((a:any)=>a.text&&a.source?.startsWith('https://')&&a.publishedDate&&Date.parse(a.publishedDate)<=now&&Date.parse(a.publishedDate)<=Date.parse(match.date)&&Date.parse(a.checkedAt)<=now&&now-Date.parse(a.checkedAt)<=86400000);
}
