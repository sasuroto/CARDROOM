export const SUMMARY_INTERVAL=6*60*60*1000;
// Teams per league this season; a team table with fewer rows is partial coverage.
export const leagueSize=(id:string)=>['bundesliga','ligue1','superlig','primeira'].includes(id)?18:id==='ucl'?36:id==='segunda'?22:20;
export function dataHealth(data:any,now=Date.now()){
 const blocks=(data.leagues||[]).flatMap((l:any)=>{
  const ref=data.refereesByLeague?.[l.id];
  return [
   ['cards',l.cards?.checkedAt,false,false],['overview',l.overview?.checkedAt,false,false],
   ['yellow',l.teams?.length?l.teamCheckedAt:null,l.teamRefreshMode==='snapshot',!!l.partial],
   ['corners',l.corners?.length?l.cornerCheckedAt:null,!l.cornerSource,l.corners?.length<leagueSize(l.id)],
   ['referees',ref?.checkedAt,ref?.refreshMode==='snapshot',!!ref?.partial]
  ].map(([key,checkedAt,manual,partial])=>{
   const error=key==='referees'?ref?.refreshError||(Date.parse(data.refereeUpdates?.[l.id]?.startedAt||'')>=Date.parse(ref?.checkedAt||'')?(data.refereeUpdates?.[l.id]?.errors||[]).find((e:string)=>e.startsWith('Статистика')):null):(data.refreshErrors||[]).find((e:string)=>e.startsWith(l.id+': '+key+':'));
   const timestamp=typeof checkedAt==='string'?Date.parse(checkedAt):NaN;
   const state=!Number.isFinite(timestamp)?'missing':error?'unavailable':manual?'snapshot':now-timestamp>SUMMARY_INTERVAL?'stale':partial?'partial':'fresh';
   return {league:l.id,key,checkedAt:checkedAt||null,state,partial:!!partial};
  });
 });
 const counts:Record<string,number>={fresh:0,partial:0,stale:0,unavailable:0,snapshot:0,missing:0};for(const b of blocks)counts[b.state]++;
 const updates=Object.values<any>(data.refereeUpdates||{}),times=updates.map(u=>Date.parse(u.completedAt)).filter(Number.isFinite);
 return {checkedAt:new Date(now).toISOString(),blocks,counts,total:blocks.length,status:blocks.length&&counts.fresh===blocks.length?'updated':counts.fresh||counts.partial?'partial':'sources-unavailable',pending:data.pendingBlocks||0,inProgress:!!data.refreshInProgress,persisted:data.persisted||null,refereeChecksOverdue:times.length<(data.leagues?.length||0)||times.some(t=>now-t>2*60*60*1000),lastRefereeCheck:times.length?new Date(Math.max(...times)).toISOString():null};
}
export function withDataHealth(data:any){const health=dataHealth(data);return {...data,refreshStatus:health.status,health}}
