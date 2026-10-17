import snapshot from './analysis-snapshot.json';
export function savedAnalysis(id:string,league:string){
 const match=snapshot.matches.find(m=>m.matchId===String(id)&&m.league===league);
 return match?{...match,stale:true}:null;
}
