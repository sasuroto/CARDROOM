import {env} from 'cloudflare:workers';
import {inspectDailyBackup} from '../../../lib/runtime-backup';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const headers={'Cache-Control':'no-store'};
 if(new URL(req.url).search)return Response.json({error:'Параметры не поддерживаются'},{status:400,headers});
 const backup=await inspectDailyBackup((env as unknown as {BUCKET?:R2Bucket}).BUCKET);
 return Response.json({readOnly:true,backup},{headers,status:['unavailable','unconfigured'].includes(backup.status)?503:200});
}
