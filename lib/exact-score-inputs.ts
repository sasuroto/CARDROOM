// Stage-two contracts only. No xG provider or bookmaker is connected, no betting execution.
export type XgSnapshot={matchKey:string;kickoff:string;source:string;observedAt:string;publishedAt:string;definitionVersion:string;homeXg:number;awayXg:number;sampleMatches:number;periodFrom:string;periodTo:string};
export type ExactScoreMarket={matchKey:string;kickoff:string;source:string;bookmaker:string;observedAt:string;quotedAt:string;period:'regular-time';completeScorePartition:boolean;partition:'explicit-scores-plus-complement';outcomes:{id:string;decimalOdds:number}[]};
export function validXg(v:XgSnapshot,matchKey:string,kickoff:string,asOf:number){
 const dates=[v.observedAt,v.publishedAt,v.periodFrom,v.periodTo].map(Date.parse);
 return v.matchKey===matchKey&&v.kickoff===kickoff&&/^https:\/\//.test(v.source)&&!!v.definitionVersion&&Number.isFinite(asOf)&&Number.isFinite(Date.parse(kickoff))&&dates.every(Number.isFinite)&&dates[0]<=asOf&&dates[1]<=dates[0]&&dates[3]<asOf&&dates[2]<=dates[3]&&asOf<Date.parse(kickoff)&&Number.isInteger(v.sampleMatches)&&v.sampleMatches>0&&[v.homeXg,v.awayXg].every(x=>Number.isFinite(x)&&x>=0);
}
export function compareExactScoreMarket(v:ExactScoreMarket,p:number,matchKey:string,kickoff:string,asOf:number){
 // A single residual outcome must explicitly cover ALL unlisted regular-time scores.
 if(!Number.isFinite(asOf)||!Number.isFinite(Date.parse(kickoff))||v.partition!=='explicit-scores-plus-complement'||v.outcomes.filter(o=>o.id==='all-other-scores').length!==1||v.outcomes.some(o=>o.id!=='all-other-scores'&&!/^(0|[1-9]\d?):(0|[1-9]\d?)$/.test(o.id))||Date.parse(v.quotedAt)>Date.parse(v.observedAt))return {status:'unavailable',reason:'Не подтверждены время и исчерпывающее разбиение рынка точных счетов.'};
 if(v.matchKey!==matchKey||v.kickoff!==kickoff||v.period!=='regular-time'||!v.completeScorePartition||!/^https:\/\//.test(v.source)||!v.bookmaker||!Number.isFinite(p)||p<=0||p>=1||![v.observedAt,v.quotedAt].every(d=>Number.isFinite(Date.parse(d))&&Date.parse(d)<=asOf)||asOf>=Date.parse(kickoff)||v.outcomes.length<2||new Set(v.outcomes.map(o=>o.id)).size!==v.outcomes.length||v.outcomes.some(o=>!Number.isFinite(o.decimalOdds)||o.decimalOdds<=1))return {status:'unavailable',reason:'Нужен полный сопоставимый рынок основного времени с предматчевой котировкой.'};
 const target=v.outcomes.find(o=>o.id==='1:1');if(!target)return {status:'unavailable',reason:'Котировка 1:1 отсутствует.'};
 const sum=v.outcomes.reduce((s,o)=>s+1/o.decimalOdds,0);if(sum<=1)return {status:'unavailable',reason:'Маржа полного рынка не подтверждена.'};
 const fair=(1/target.decimalOdds)/sum;
 return {status:'comparison-only',source:v.source,quotedAt:v.quotedAt,observedAt:v.observedAt,bookmaker:v.bookmaker,decimalOdds:target.decimalOdds,overround:sum-1,normalization:'proportional',marketProbability:fair,modelProbability:p,difference:p-fair,profitabilityVerified:false};
}
