import {env} from 'cloudflare:workers';
import {LEAGUES} from '../../../lib/fixtures';
import {readCache} from '../../../lib/cache';
import {journalKey,refereeRecords,refereeSummary,JOURNAL_START} from '../../../lib/referee-journal';
import {refreshRefereeJournal,summary} from '../../../lib/referee-journal-refresh';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
// ?league=X runs one bounded collection pass (scheduler); &read=1 only reads the stored journal.
// ?referee=Name returns, with the league average without that referee, one referee's matches across all stored leagues (exact name in ESPN spelling).
export async function GET(req:Request){
 const params=new URL(req.url).searchParams,league=params.get('league'),referee=params.get('referee'),bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
 if([...params.keys()].some(k=>!['league','read','referee'].includes(k))||(league&&!LEAGUES[league])||(params.has('read')&&params.get('read')!=='1')||(referee!==null&&(referee.length<5||referee.length>80||!/^[\p{L}\s.'-]+$/u.test(referee)))||(referee&&league))return Response.json({error:'Некорректный запрос'},{status:400,headers});
 if(referee){
  const stored=await Promise.all(Object.keys(LEAGUES).map(async id=>({id,report:await readCache(bucket,journalKey(id))})));
  const leagues=stored.filter(s=>s.report).map(({id,report})=>{const records=refereeRecords(report.records||[],referee);return {league:id,completedAt:report.completedAt,coverage:report.coverage,average:refereeSummary((report.records||[]).filter((r:any)=>!records.includes(r))),records,...refereeSummary(records)}}).filter(l=>l.records.length);
  return Response.json({referee,period:{from:JOURNAL_START},source:'https://www.espn.com/soccer/',leagues,checkedLeagues:stored.filter(s=>s.report).map(s=>s.id)},{headers});
 }
 if(!league||params.get('read')==='1'){
  const ids=league?[league]:Object.keys(LEAGUES);
  const leagues=await Promise.all(ids.map(async id=>{const saved=await readCache(bucket,journalKey(id));return saved?{...summary(saved),persisted:true}:{league:id,status:'not-collected',persisted:false}}));
  return Response.json(league?leagues[0]:{period:{from:JOURNAL_START},intervalMinutes:60,leagues},{headers});
 }
 try{return Response.json(await refreshRefereeJournal(league,bucket),{headers})}
 catch(error){return Response.json({league,persisted:false,error:String(error)},{status:503,headers})}
}
