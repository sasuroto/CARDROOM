import {sameTeam} from './selection-tracker';

// Initial test list. Each entry is matched by competition, both teams in home/away
// order and the scheduled day(s); a name match alone is not enough.
export const SEED_FIXTURES=[
 {league:'bundesliga',home:'Bayern Munich',away:'Borussia Dortmund',days:['2026-10-31']},
 {league:'epl',home:'Tottenham Hotspur',away:'Crystal Palace',days:['2026-10-31']},
 {league:'seriea',home:'AC Milan',away:'Inter Milan',days:['2026-10-31']},
 {league:'laliga',home:'Barcelona',away:'Alavés',days:['2026-10-31','2026-11-01']},
 {league:'epl',home:'Aston Villa',away:'Fulham',days:['2026-10-31','2026-11-01']},
];
export const SEED_UNTIL='2026-11-03T00:00:00Z';
export const SEED_DAYS=['2026-10-31','2026-11-01'];

const utcDay=(d:string)=>new Date(d).toISOString().slice(0,10);
// Kickoff day is checked in UTC and Tbilisi so a late kickoff is not lost at midnight.
const tbilisiDay=(d:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));

export function matchSeeds(events:any[]){
 const found:{seed:typeof SEED_FIXTURES[number],event:any}[]=[],missing:typeof SEED_FIXTURES=[];
 for(const seed of SEED_FIXTURES){
  const candidates=events.filter(e=>e&&e.league===seed.league&&e.home&&e.away&&sameTeam(e.home,seed.home)&&sameTeam(e.away,seed.away)&&e.date&&Number.isFinite(Date.parse(e.date))&&(seed.days.includes(utcDay(e.date))||seed.days.includes(tbilisiDay(e.date))));
  const unique=[...new Map(candidates.map(e=>[String(e.id),e])).values()];
  if(unique.length===1)found.push({seed,event:unique[0]});else missing.push(seed);
 }
 return {found,missing};
}
