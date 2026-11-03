import {poissonUnder} from './market-model';
// Sensitivity is NOT a confidence interval or a calibrated probability.
export const DOT_IDS = ['result','goals25','btts','home','away','corners95','yellow45','shots255','target95','fouls215'];
export type DotEvidence={label:string;source:string;checkedAt:string;maxAgeMs:number};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const https=(s:unknown)=>{try{return typeof s==='string'&&new URL(s).protocol==='https:'}catch{return false}};
export function dotFamily(metric:string){
 if(['result','double','goals','home','away','btts','shots','target','saves','offsides'].includes(metric))return 'attack';
 if(['yellow','red','fouls'].includes(metric))return 'discipline';
 return metric==='corners'?'corners':null;
}
export function dotHistoryEvidence(home:any,away:any,metric:string):DotEvidence[]{
 return [home,away].flatMap(t=>(t?.events||[]).filter((e:any)=>typeof e.own?.[metric]==='number'&&typeof e.against?.[metric]==='number').map((e:any)=>({label:`${t.name||t.id} · ${e.date||'дата матча неизвестна'}`,source:e.source,checkedAt:e.checkedAt,maxAgeMs:86400000})));
}
export function dotEvidenceFresh(evidence:DotEvidence[],now:number,kickoff:number){
 return Array.isArray(evidence)&&evidence.length>0&&evidence.every(e=>{
  const checked=Date.parse(e.checkedAt);
  return https(e.source)&&Number.isFinite(checked)&&checked<=now&&checked<=kickoff&&finite(e.maxAgeMs)&&e.maxAgeMs>0&&now-checked<=e.maxAgeMs;
 });
}
function outcomes(home:number,away:number){
 const mass=(mean:number)=>{const a=[Math.exp(-mean)];for(let k=1;k<31;k++)a.push(a[k-1]*mean/k);return a};
 const h=mass(home),a=mass(away),p=[0,0,0];
 for(let i=0;i<h.length;i++)for(let j=0;j<a.length;j++)p[i>j?0:i===j?1:2]+=h[i]*a[j];
 return p.reduce((s,v)=>s+v,0)>=1-1e-6?p:null;
}
export function dotSensitivity(m:any):{low:number;high:number}|null{
 const p=m.param;
 if(!p||![p.mean,p.homeMean,p.awayMean].every(finite)||!finite(m.p)||m.p>=1)return null;
 const scale=[.8,1,1.2];let values:number[]=[],base:number;
 if(m.metric==='result'){
  const original=outcomes(p.homeMean,p.awayMean);if(!original)return null;
  const chosen=original.indexOf(Math.max(...original));base=original[chosen];
  // Keep the selected outcome fixed; vary both teams independently.
  for(const h of scale)for(const a of scale){const v=outcomes(p.homeMean*h,p.awayMean*a);if(!v)return null;values.push(v[chosen])}
 }else if(m.metric==='btts'){
  const yes=(h:number,a:number)=>(1-Math.exp(-h))*(1-Math.exp(-a));
  const selectedYes=yes(p.homeMean,p.awayMean)>=.5;
  const value=(h:number,a:number)=>selectedYes?yes(h,a):1-yes(h,a);
  base=value(p.homeMean,p.awayMean);values=scale.flatMap(h=>scale.map(a=>value(p.homeMean*h,p.awayMean*a)));
 }else{
  if(!finite(m.line))return null;
  const mean=m.metric==='home'?p.homeMean:m.metric==='away'?p.awayMean:p.mean;
  const selectedUnder=poissonUnder(mean,m.line)>=.5;
  const value=(n:number)=>selectedUnder?poissonUnder(n,m.line):1-poissonUnder(n,m.line);
  base=value(mean);values=scale.map(s=>value(mean*s));
 }
 if(Math.abs(base-m.p)>1e-6||values.some(v=>!finite(v)||v>1))return null;
 return {low:Math.min(...values),high:Math.max(...values)};
}
export function dotSelection(markets:any[],{pre,fresh,refereeEligible,now,kickoff}:{pre:boolean;fresh:boolean;refereeEligible:boolean;now:number;kickoff:number}){
 if(!pre||!fresh||!Number.isFinite(now)||!Number.isFinite(kickoff)||now>=kickoff)return [];
 const seen=new Set<string>();
 return markets.filter(m=>DOT_IDS.includes(m.id)&&finite(m.p)&&m.p<1&&m.param&&[m.param.nH,m.param.nA].every(n=>Number.isInteger(n)&&n>=10)&&dotEvidenceFresh(m.param.evidence,now,kickoff)&&(dotFamily(m.metric)!=='discipline'||refereeEligible)&&(m.metric!=='yellow'||m.param.refereeAdjustment===true))
 .map(m=>({...m,sensitivity:dotSensitivity(m)})).filter(m=>m.sensitivity&&m.sensitivity.low>=.65)
 .sort((a,b)=>b.sensitivity.low-a.sensitivity.low||b.p-a.p||a.id.localeCompare(b.id))
 .filter(m=>{const family=dotFamily(m.metric);if(!family||seen.has(family))return false;seen.add(family);return true}).slice(0,3);
}
export function dotFresh(match:any,analysis:any,error:string,now=Date.now()){
 const checked=Date.parse(analysis?.checkedAt||'');
 return !error&&!match?.stale&&!match?.error&&!analysis?.stale&&!analysis?.errors?.length&&Number.isFinite(checked)&&checked<=now&&now-checked<=15*60000&&Date.parse(analysis?.date)===Date.parse(match?.date)&&analysis?.source===`https://www.espn.com/soccer/match/_/gameId/${match.id}`;
}
export function dotAvailability(context:any,match:any,now=Date.now()){
 if(context?.id!==String(match.id)||context?.league!==match.league||Date.parse(context?.date)!==Date.parse(match.date))return [];
 return (context.availability||[]).filter((a:any)=>typeof a.team==='string'&&[match.home,match.away].includes(a.team)&&a.text&&https(a.source)&&a.publishedDate&&Date.parse(a.publishedDate)<=now&&Date.parse(a.publishedDate)<=Date.parse(match.date)&&Date.parse(a.checkedAt)>=Date.parse(a.publishedDate)&&Date.parse(a.checkedAt)<=now&&now-Date.parse(a.checkedAt)<=86400000);
}
export function dotLineupsConfirmed(match:any,analysis:any,error:string,now:number){
 if(!dotFresh(match,analysis,error,now))return false;
 return ['home','away'].every(side=>{
  const team=analysis?.teams?.find((t:any)=>t.side===side);if(!team?.id)return false;
  return analysis?.lineups?.some((t:any)=>(t.teamId?String(t.teamId)===String(team.id):!!team.name&&t.team===team.name)&&new Set((t.players||[]).filter((p:any)=>p.starter===true&&p.id).map((p:any)=>String(p.id))).size>=11);
 });
}
