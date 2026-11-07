import {env} from 'cloudflare:workers';
import {LEAGUES} from '../../../lib/fixtures';
import {operationalHealth} from '../../../lib/operational-health';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const headers={'Cache-Control':'no-store'};
 if(new URL(req.url).search)return Response.json({error:'Параметры не поддерживаются'},{status:400,headers});
 const report=await operationalHealth((env as unknown as {BUCKET?:R2Bucket}).BUCKET,Object.keys(LEAGUES));
 return Response.json(report,{status:report.status==='unavailable'?503:200,headers});
}
