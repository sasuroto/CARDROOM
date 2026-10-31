// Lightweight selection tracker: records what the user picked and checks it
// against verified final scores. It never fetches odds and never places bets.

export type ResultPick='1'|'X'|'2'|'1X'|'X2'|'12';
export type Market={result?:ResultPick,total?:{side:'over'|'under',line:number}};
export type SelectionStatus='pending'|'won'|'lost'|'void'|'unknown';
export type TrackedFixture={key:string,league:string,home:string,away:string,date?:string,days:string[],espnId?:string};
export type Selection={id:string,fixtureKey:string,market:Market,odds:number|null,stake:number|null,manualStatus?:SelectionStatus|null,note?:string,createdAt:string};
export type Accumulator={id:string,selectionIds:string[],stake:number|null,createdAt:string};
export type TrackerState={version:1,fixtures:TrackedFixture[],selections:Selection[],accumulators:Accumulator[],updatedAt:string};
export type Settlement={status:SelectionStatus,reason:string};

export const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\b(fc|cf|ac|afc|sc|cd|deportivo|club|de|calcio)\b/g,' ').replace(/[^a-z0-9]/g,'');
const ALIASES:Record<string,string>={internazionale:'inter',intermilan:'inter',milan:'acmilan',bayernmunchen:'bayernmunich',fcbayernmunchen:'bayernmunich',tottenhamhotspur:'tottenham',spurs:'tottenham',alaves:'alaves',deportivoalaves:'alaves',fcbarcelona:'barcelona',barca:'barcelona',borussiadortmund:'dortmund',bvb:'dortmund'};
export const teamKey=(s:string)=>{const n=norm(s);return ALIASES[n]||n};
export const sameTeam=(a:string,b:string)=>{const x=teamKey(a),y=teamKey(b);return !!x&&!!y&&(x===y||(Math.min(x.length,y.length)>=5&&(x.includes(y)||y.includes(x))))};

export const fixtureKey=(f:{league:string,home:string,away:string,days?:string[],date?:string})=>`${f.league}:${teamKey(f.home)}-${teamKey(f.away)}:${(f.days?.[0]||String(f.date||'').slice(0,10))}`;

export function marketLabel(m:Market){
 const r=m.result?({'1':'П1','X':'X','2':'П2','1X':'1X','X2':'X2','12':'12'} as const)[m.result]:'';
 const t=m.total?`${m.total.side==='over'?'ТБ':'ТМ'} ${String(m.total.line).replace('.',',')}`:'';
 return [r,t].filter(Boolean).join(' + ')||'Рынок не задан';
}
export function validMarket(m:any):m is Market{
 if(!m||typeof m!=='object')return false;
 const r=m.result===undefined||['1','X','2','1X','X2','12'].includes(m.result);
 const t=m.total===undefined||(['over','under'].includes(m.total?.side)&&Number.isFinite(m.total?.line)&&m.total.line>0&&m.total.line<20&&Math.abs(m.total.line%1-.5)<1e-9);
 return r&&t&&(m.result!==undefined||m.total!==undefined);
}
export const validOdds=(v:any)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>1&&v<1000);
export const validStake=(v:any)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e7);

// Final regulation-time scores only. Extra time, penalties, postponement or an
// unverified (stale) score are left for the user to settle under their bookmaker's rules.
const FINAL=new Set(['STATUS_FULL_TIME','STATUS_FINAL']);
const POSTPONED=/POSTPONED|CANCELED|CANCELLED|ABANDONED|SUSPENDED|DELAYED|FORFEIT/;
export function settleSelection(sel:Selection,match:any):Settlement{
 if(sel.manualStatus)return {status:sel.manualStatus,reason:'Отмечено вручную'};
 if(!match)return {status:'pending',reason:'Данные матча ещё не получены из календаря'};
 const name=String(match.statusName||'');
 if(POSTPONED.test(name))return {status:'unknown',reason:'Матч перенесён, прерван или отменён. Расчёт — по правилам букмекера; отметьте вручную.'};
 if(match.state!=='post')return {status:'pending',reason:match.state==='in'?'Матч идёт':'Матч не начался'};
 if(match.stale)return {status:'unknown',reason:'Итог из сохранённого среза; дождитесь свежего подтверждения.'};
 if(name&&!FINAL.has(name))return {status:'unknown',reason:'Матч завершён не в основное время или статус не распознан. Отметьте вручную.'};
 const score=(v:any)=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v);
 const h=score(match.homeScore),a=score(match.awayScore);
 if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return {status:'unknown',reason:'Итоговый счёт не подтверждён'};
 const m=sel.market;if(!validMarket(m))return {status:'unknown',reason:'Рынок не поддерживается автоматическим расчётом'};
 const outcome=h>a?'1':h<a?'2':'X';
 const okResult=!m.result||m.result.includes(outcome);
 const goals=h+a,okTotal=!m.total||(m.total.side==='over'?goals>m.total.line:goals<m.total.line);
 return {status:okResult&&okTotal?'won':'lost',reason:`Итог ${h}:${a} (основное время)`};
}

export function slipReturn(odds:(number|null)[],stake:number|null){
 const known=odds.every(o=>typeof o==='number');
 const combined=known?(odds as number[]).reduce((p,o)=>p*o,1):null;
 if(combined===null||!stake)return {combined,potentialReturn:null,netProfit:null};
 return {combined,potentialReturn:stake*combined,netProfit:stake*combined-stake};
}

// An accumulator wins only when every leg is settled won (void legs count at 1.00).
export function settleAccumulator(legs:{status:SelectionStatus,odds:number|null}[],stake:number|null){
 const statuses=legs.map(l=>l.status);
 let status:SelectionStatus;
 if(statuses.includes('lost'))status='lost';
 else if(statuses.includes('pending'))status='pending';
 else if(statuses.includes('unknown'))status='unknown';
 else if(statuses.every(s=>s==='void'))status='void';
 else status='won';
 const effective=legs.map(l=>l.status==='void'?1:l.odds);
 const r=slipReturn(effective,stake),potential=slipReturn(legs.map(l=>l.odds),stake);
 const settledReturn=status==='won'?r.potentialReturn:status==='void'?stake:status==='lost'?0:null;
 return {status,combined:potential.combined,potentialReturn:potential.potentialReturn,netProfit:potential.netProfit,settledReturn,settledProfit:settledReturn!==null&&stake?settledReturn-stake:null};
}

export function addFixture(state:TrackerState,f:Omit<TrackedFixture,'key'>&{key?:string}):{state:TrackerState,fixture:TrackedFixture,duplicate:boolean}{
 const existing=state.fixtures.find(x=>(f.espnId&&x.espnId===f.espnId&&x.league===f.league)||(x.league===f.league&&sameTeam(x.home,f.home)&&sameTeam(x.away,f.away)&&x.days.some(d=>f.days.includes(d))));
 if(existing)return {state,fixture:existing,duplicate:true};
 const fixture={...f,key:f.key||fixtureKey(f)};
 return {state:{...state,fixtures:[...state.fixtures,fixture],updatedAt:new Date(Date.now()).toISOString()},fixture,duplicate:false};
}
export function addSelection(state:TrackerState,sel:Omit<Selection,'id'|'createdAt'>&{id?:string}){
 if(!state.fixtures.some(f=>f.key===sel.fixtureKey)||!validMarket(sel.market)||!validOdds(sel.odds)||!validStake(sel.stake))return {state,added:false,reason:'invalid'};
 const dup=state.selections.find(s=>s.fixtureKey===sel.fixtureKey&&marketLabel(s.market)===marketLabel(sel.market));
 if(dup)return {state,added:false,reason:'duplicate'};
 const now=new Date(Date.now()).toISOString(),id=sel.id||`${sel.fixtureKey}|${marketLabel(sel.market)}`;
 return {state:{...state,selections:[...state.selections,{...sel,id,createdAt:now}],updatedAt:now},added:true,reason:''};
}
export function removeFixture(state:TrackerState,key:string):TrackerState{
 const ids=new Set(state.selections.filter(s=>s.fixtureKey===key).map(s=>s.id));
 return {...state,fixtures:state.fixtures.filter(f=>f.key!==key),selections:state.selections.filter(s=>!ids.has(s.id)),accumulators:state.accumulators.map(a=>({...a,selectionIds:a.selectionIds.filter(id=>!ids.has(id))})).filter(a=>a.selectionIds.length>1),updatedAt:new Date(Date.now()).toISOString()};
}
export function resolveFixture(state:TrackerState,key:string,match:{id:string,date:string}):TrackerState{
 const f=state.fixtures.find(x=>x.key===key);if(!f||(f.espnId===String(match.id)&&f.date===match.date))return state;
 // The fixture key stays stable; only the resolved ID and kickoff are attached.
 return {...state,fixtures:state.fixtures.map(x=>x.key===key?{...x,espnId:String(match.id),date:match.date}:x),updatedAt:new Date(Date.now()).toISOString()};
}
export function findMatch(f:TrackedFixture,events:any[]){
 if(f.espnId){const byId=events.find(e=>String(e.id)===f.espnId&&e.league===f.league);if(byId)return byId}
 const candidates=events.filter(e=>e.league===f.league&&sameTeam(e.home,f.home)&&sameTeam(e.away,f.away));
 return candidates.length===1?candidates[0]:undefined;
}

export function sanitizeState(raw:any):TrackerState|null{
 if(!raw||raw.version!==1||!Array.isArray(raw.fixtures)||!Array.isArray(raw.selections))return null;
 const str=(v:any,max=120)=>typeof v==='string'&&v.length>0&&v.length<=max;
 const fixtures=raw.fixtures.filter((f:any)=>str(f.key,200)&&str(f.league,20)&&str(f.home)&&str(f.away)&&Array.isArray(f.days)&&f.days.length<=4&&f.days.every((d:any)=>/^\d{4}-\d{2}-\d{2}$/.test(d))&&(f.espnId===undefined||/^\d{5,12}$/.test(f.espnId))).slice(0,60)
  .map((f:any)=>({key:f.key,league:f.league,home:f.home,away:f.away,days:f.days,...(f.date&&Number.isFinite(Date.parse(f.date))?{date:f.date}:{}),...(f.espnId?{espnId:f.espnId}:{})}));
 const keys=new Set(fixtures.map((f:TrackedFixture)=>f.key));
 const statuses=['pending','won','lost','void','unknown'];
 const selections=raw.selections.filter((s:any)=>str(s.id,260)&&keys.has(s.fixtureKey)&&validMarket(s.market)&&validOdds(s.odds??null)&&validStake(s.stake??null)&&(s.manualStatus==null||statuses.includes(s.manualStatus))).slice(0,200)
  .map((s:any)=>({id:s.id,fixtureKey:s.fixtureKey,market:{...(s.market.result?{result:s.market.result}:{}),...(s.market.total?{total:{side:s.market.total.side,line:s.market.total.line}}:{})},odds:s.odds??null,stake:s.stake??null,manualStatus:s.manualStatus??null,...(str(s.note,200)?{note:s.note}:{}),createdAt:str(s.createdAt,40)?s.createdAt:new Date(0).toISOString()}));
 const ids=new Set(selections.map((s:Selection)=>s.id));
 const accumulators=(Array.isArray(raw.accumulators)?raw.accumulators:[]).filter((a:any)=>str(a.id,80)&&Array.isArray(a.selectionIds)&&validStake(a.stake??null)).map((a:any)=>({id:a.id,selectionIds:[...new Set<string>(a.selectionIds.filter((x:any)=>ids.has(x)))],stake:a.stake??null,createdAt:str(a.createdAt,40)?a.createdAt:new Date(0).toISOString()})).filter((a:Accumulator)=>a.selectionIds.length>1).slice(0,30);
 return {version:1,fixtures,selections,accumulators,updatedAt:str(raw.updatedAt,40)?raw.updatedAt:new Date(0).toISOString()};
}

// Initial list requested for 31 Oct – 1 Nov 2026. ESPN IDs and kickoffs were read
// from the ESPN scoreboard on 31.10.2026; Aston Villa – Fulham is resolved at runtime.
// Odds are manually entered reference prices, not live bookmaker prices.
export function initialTracker():TrackerState{
 const fx=(league:string,home:string,away:string,days:string[],espnId?:string,date?:string):TrackedFixture=>({key:fixtureKey({league,home,away,days}),league,home,away,days,...(espnId?{espnId}:{}),...(date?{date}:{})});
 const fixtures=[
  fx('bundesliga','Bayern Munich','Borussia Dortmund',['2026-10-31'],'401884754','2026-10-31T17:30Z'),
  fx('epl','Tottenham Hotspur','Crystal Palace',['2026-10-31'],'401878761','2026-10-31T17:30Z'),
  fx('seriea','AC Milan','Internazionale',['2026-10-31'],'401874795','2026-10-31T19:45Z'),
  fx('laliga','Barcelona','Alavés',['2026-10-31'],'401882822','2026-10-31T20:00Z'),
  fx('epl','Aston Villa','Fulham',['2026-10-31','2026-11-01']),
 ];
 const created='2026-10-31T17:00:00.000Z';
 const sel=(i:number,market:Market,odds:number):Selection=>({id:`${fixtures[i].key}|${marketLabel(market)}`,fixtureKey:fixtures[i].key,market,odds,stake:null,manualStatus:null,note:'Коэффициент внесён вручную; не живая цена букмекера',createdAt:created});
 return {version:1,fixtures,selections:[
  sel(0,{result:'1'},1.30),sel(0,{result:'1X'},1.08),
  sel(1,{result:'1X'},1.17),
  sel(2,{result:'2',total:{side:'over',line:1.5}},2.47),
  sel(3,{result:'1',total:{side:'over',line:2.5}},1.33),
  sel(4,{result:'1X'},1.28),
 ],accumulators:[],updatedAt:created};
}
