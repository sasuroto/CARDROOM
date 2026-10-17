import {env} from 'cloudflare:workers';
import {LEAGUES} from '../../../lib/fixtures';
import {validSeason} from '../../../lib/league-data-cache';
import {loadLeagueTable} from '../../../lib/league-table';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,league=q.get('league')||'',season=validSeason(q.get('season'));
 if(!LEAGUES[league]||season===null)return Response.json({error:'Некорректный турнир или сезон'},{status:400});
 return Response.json(await loadLeagueTable((env as unknown as {BUCKET?:R2Bucket}).BUCKET,league,season),{headers:{'Cache-Control':'no-store'}});
}
