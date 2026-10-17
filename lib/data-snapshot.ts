const time=(value:any)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
// A persisted partial refresh must not hide a newer verified bundled block.
// Preserve the last attempt/TTL so deployment never retries a rate-limited source.
export function mergeDataSnapshot(seed:any,saved:any){
 if(!Array.isArray(saved?.leagues))return structuredClone(seed);
 const result={...structuredClone(seed),...saved};
 result.leagues=seed.leagues.map((base:any)=>{
  const old=saved.leagues.find((l:any)=>l.id===base.id&&l.season===base.season);
  if(!old)return structuredClone(base);
  const league={...base,...old};
  for(const key of ['cards','overview','yellowSummary'])if(time(base[key]?.checkedAt)>time(old[key]?.checkedAt))league[key]=structuredClone(base[key]);
  for(const [key,stamp,extras] of [['teams','teamCheckedAt',['partial','teamNote']],['corners','cornerCheckedAt',[]]] as const){
   if(time(base[stamp])>time(old[stamp])){league[key]=structuredClone(base[key]);league[stamp]=base[stamp];for(const extra of extras)league[extra]=base[extra]}
  }
  return league;
 });
 result.refereesByLeague={...seed.refereesByLeague,...saved.refereesByLeague};
 for(const [id,base] of Object.entries<any>(seed.refereesByLeague||{}))if(time(base.checkedAt)>time(saved.refereesByLeague?.[id]?.checkedAt))result.refereesByLeague[id]=structuredClone(base);
 if(time(seed.refCheckedAt)>time(saved.refCheckedAt)){result.referees=structuredClone(seed.referees);result.refCheckedAt=seed.refCheckedAt}
 if(time(seed.lastAttempt)>time(saved.lastAttempt))for(const key of ['lastAttempt','refreshStatus','refreshErrors','updatedFields'])result[key]=seed[key];
 return result;
}
