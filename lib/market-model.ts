// Transparent research model, not a calibrated prediction service.
export function poissonUnder(lambda:number,line:number){if(!Number.isFinite(lambda)||lambda<0)throw Error('Invalid mean');let term=Math.exp(-lambda),sum=term;for(let k=1;k<=Math.floor(line);k++){term*=lambda/k;sum+=term}return Math.min(1,Math.max(0,sum))}
const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-zа-я0-9]/g,'');
const aliases:Record<string,string>={барселона:'barcelona',fcbarcelona:'barcelona',галатасарай:'galatasaray',manchesterunited:'manutd',manchestercity:'mancity',tottenhamhotspur:'tottenham',nottinghamforest:'nottmforest',wolverhamptonwanderers:'wolves',atleticomadrid:'atleticomadrid',internazionale:'inter',intermilan:'inter',bayernmunich:'bayernmunchen',borussiadortmund:'dortmund',borussiamonchengladbach:'bmonchengladbach'};
const canonical=(s:string)=>aliases[clean(s)]||clean(s);
const matchTeam=(rows:any[],name:string)=>rows.find(r=>canonical(r.name)===canonical(name));
const finite=(...x:any[])=>x.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
export function buildMarkets(match:any,profile:any,data:any,now=Date.now()){
 const l=data?.leagues?.find((x:any)=>x.id===match.league);if(!l)return {markets:[],reasons:['Нет статистики выбранного турнира.']};
 const h=matchTeam(l.teams||[],match.home),a=matchTeam(l.teams||[],match.away),sources:string[]=[],reasons:string[]=[],markets:any[]=[];
 const pre=Date.parse(match.date)>now&&match.state!=='post'&&match.state!=='in';if(!pre){reasons.push('Матч уже начался или завершён: предматчевые рекомендации отключены.');return {markets:[],reasons,pre};}
 const fresh=(date?:string)=>!!date&&now-Date.parse(date)<7*86400000&&now>=Date.parse(date);
 let ref:any=null;const group=data.refereesByLeague?.[match.league];
 const named=(s:string)=>clean(s).replace(/^mguida$/,'marcoguida');
 if(match.referee)ref=group?.rows?.find((r:any)=>named(r.name)===named(match.referee));
 // The curated profile separates current UCL and last season; no domestic/all-season substitution.
 if(match.league==='ucl'&&named(match.referee||'')==='marcoguida'&&profile?.history&&profile.stats?.[1]){const current=profile.stats[1],old=profile.history;ref={yellow:(current.yellowTotal+old.yellowTotal)/(current.n+old.n),n:current.n+old.n,source:profile.source,checkedAt:profile.checkedAt,period:'ЛЧ 2025/26 + 2026/27, включая квалификацию'};}
 if(ref&&!ref.source)ref={...ref,source:group.source,checkedAt:group.checkedAt,period:l.season};
 const teamYC=!!h&&!!a&&finite(h.yellow,h.opp,a.yellow,a.opp)&&h.n>0&&a.n>0;
 let yellowMean:number|null=null,quality=false,basis='',why:string[]=[];
 if(teamYC){yellowMean=(h.yellow+a.opp+a.yellow+h.opp)/2;basis=`Команды: ${h.name} N=${h.n}, ${a.name} N=${a.n}.`;sources.push(l.teamSource);if(ref&&finite(ref.yellow)&&ref.n>0){const w=Math.min(ref.n,20);yellowMean=(yellowMean*20+ref.yellow*w)/(20+w);basis+=` Судья: N=${ref.n}, ${ref.period}.`;sources.push(ref.source)}
  if(h.n<10||a.n<10)why.push('У каждой команды нужно минимум 10 матчей в этом турнире.');if(!ref||ref.n<10)why.push('Нет подтверждённой выборки судьи минимум из 10 матчей этого турнира.');if(!fresh(l.teamCheckedAt)||!fresh(ref?.checkedAt))why.push('Срез старше 7 дней или дата проверки отсутствует.');quality=why.length===0;
 }else if(ref&&finite(ref.yellow)&&ref.n>0){yellowMean=ref.yellow;basis=`Только судья: ${ref.n} матчей · ${ref.period}.`;sources.push(ref.source);why.push('Нет сопоставимых данных обеих команд в выбранном турнире: это ориентир по судье, не полноценный прогноз пары.');}
 else reasons.push('Для ЖК нет достаточных исходных данных выбранного турнира.');
 const add=(kind:string,lambda:number,lines:number[],basis:string,eligible:boolean,why:string[],urls:string[])=>{for(const line of lines){const under=poissonUnder(lambda,line),side=under>=.5?'ТМ':'ТБ',p=side==='ТМ'?under:1-under;const values=[lambda*.8,lambda,lambda*1.2].map(v=>side==='ТМ'?poissonUnder(v,line):1-poissonUnder(v,line));const low=Math.min(...values),high=Math.max(...values);markets.push({id:kind+line,kind,line,side,title:`${side} ${String(line).replace('.',',')} ${kind==='yc'?'жёлтых карточек':'угловых'}`,p,low,high,mean:lambda,basis,eligible:eligible&&pre,why:[...why,...(!pre?[reasons[0]]:[])],sources:[...new Set(urls.filter(Boolean))],fair:1/p,minimum:1.05/low})}};
 if(yellowMean!==null)add('yc',yellowMean,[3.5,4.5,5.5],basis,quality,why,sources);
 const ch=matchTeam(l.corners||[],match.home),ca=matchTeam(l.corners||[],match.away);
 if(ch&&ca&&ch.n>0&&ca.n>0&&finite(ch.for,ch.against,ca.for,ca.against)){const why:string[]=[];if(ch.n<10||ca.n<10)why.push('Для угловых нужно минимум по 10 матчей каждой команды.');if(!fresh(l.cornerCheckedAt))why.push('Срез угловых старше 7 дней или не датирован.');add('corners',(ch.for+ca.against+ca.for+ch.against)/2,[8.5,9.5,10.5],`${ch.name} N=${ch.n}; ${ca.name} N=${ca.n}.`,!why.length,why,[l.cornerSource]);}
 markets.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.p-a.p);return {markets:markets.slice(0,3),reasons,pre};
}
