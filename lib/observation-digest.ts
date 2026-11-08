import {LEAGUES} from './fixtures';
import type {PeriodEvidence} from './period-evidence-types';

const time=(v:unknown)=>typeof v==='string'?Date.parse(v):NaN;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,wanted:string[])=>plain(v)&&Object.keys(v).sort().join('|')===[...wanted].sort().join('|');
const omitTime=(v:Record<string,unknown>)=>Object.fromEntries(Object.entries(v).filter(([key])=>key!=='checkedAt'));
/** Legacy hashes remain exact. Version 2 changes only known proof timestamp hashing.
 * Validate against the observation time, never today's clock: archives remain verifiable. */
export function observationDigestFacts(payload:Record<string,unknown>,captureAt?:number){
 const facts=omitTime(payload);
 if(!Object.prototype.hasOwnProperty.call(payload,'digestVersion'))return facts;
 if(payload.digestVersion!==2)throw Error('unsupported-observation-digest');
 const proof=payload.periodEvidence as PeriodEvidence|undefined,m=proof?.match;
 if(!keys(proof,['version','method','summary','scoreboard','match'])||proof?.version!==1||proof.method!=='espn-summary-scoreboard'||!keys(proof.summary,['source','checkedAt','period'])||!keys(proof.scoreboard,['source','checkedAt','period'])||!keys(m,['id','league','kickoff','homeId','awayId','homeScore','awayScore','statusName']))throw Error('invalid-period-proof');
 const at=time(payload.checkedAt),summaryAt=time(proof.summary.checkedAt),scoreAt=time(proof.scoreboard.checkedAt),kickoff=time(m?.kickoff);
 const home=plain(payload.homeStats)?payload.homeStats.goals:null,away=plain(payload.awayStats)?payload.awayStats.goals:null;
 if(payload.schemaVersion!==1||payload.kind!=='analysis'||payload.period!==2||payload.summaryPeriod!==null||proof.summary.period!==null||proof.scoreboard.period!==2||payload.state!=='post'||!m||!['STATUS_FULL_TIME','STATUS_FINAL'].includes(m.statusName)||/extra|penalt|shootout|дополн|пенальти/i.test(String(payload.statusDetail||''))||![at,summaryAt,scoreAt,kickoff].every(Number.isFinite)||summaryAt!==at||Math.abs(summaryAt-scoreAt)>120000||kickoff>Math.min(summaryAt,scoreAt))throw Error('invalid-period-proof');
 if(m.id!==payload.id||m.league!==payload.league||m.kickoff!==payload.kickoff||m.statusName!==payload.statusName||m.homeId!==String(payload.homeId)||m.awayId!==String(payload.awayId)||m.homeId===m.awayId||!/^\d+$/.test(m.homeId)||!/^\d+$/.test(m.awayId)||!/^\d{5,12}$/.test(m.id)||![m.homeScore,m.awayScore].every(v=>Number.isInteger(v)&&v>=0&&v<=999)||m.homeScore!==home||m.awayScore!==away||!LEAGUES[m.league])throw Error('invalid-period-proof');
 if(captureAt!==undefined&&(!Number.isFinite(captureAt)||summaryAt>captureAt||scoreAt>captureAt))throw Error('future-period-proof');
 const endpoint=`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUES[m.league]}`,date=new Date(kickoff).toISOString().slice(0,10).replaceAll('-','');
 if(payload.source!==`https://www.espn.com/soccer/match/_/gameId/${m.id}`||proof.summary.source!==`${endpoint}/summary?event=${m.id}`||proof.scoreboard.source!==`${endpoint}/scoreboard?dates=${date}&limit=100`)throw Error('invalid-period-proof');
 return {...facts,periodEvidence:{...proof,summary:omitTime({...proof.summary}),scoreboard:omitTime({...proof.scoreboard})}};
}
