import {env} from 'cloudflare:workers';
import {startDrive,type DriveEnv} from '../../../../lib/backup-drive.server';
import {driveBrowserResult} from '../../../../lib/backup-drive-page.server';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const response=await startDrive(req,env as DriveEnv);
 // Keep the Google redirect and its HttpOnly nonce cookie intact on success.
 return response.status!==303&&req.headers.get('Accept')?.includes('text/html')?driveBrowserResult(response):response;
}
