import {env} from 'cloudflare:workers';
import {LEAGUES} from '../../../lib/fixtures';
import {exactValidation} from '../../../lib/exact-score-journal';
export const dynamic='force-dynamic';
// Read-only validation. No provider fetch, payload ingestion, or retrospective prediction writes.
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,league=q.get('league')||'';
 if([...q.keys()].some(k=>k!=='league')||!LEAGUES[league])return Response.json({status:'invalid',reason:'Укажите подключённый турнир.'},{status:400});
 const result=await exactValidation((env as unknown as {DB?:D1Database}).DB,league);
 return Response.json(result,{status:result.status==='unavailable'?503:200,headers:{'Cache-Control':'no-store'}});
}
