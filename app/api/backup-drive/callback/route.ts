import {env} from 'cloudflare:workers';
import {finishDrive,type DriveEnv} from '../../../../lib/backup-drive.server';
import {driveBrowserResult} from '../../../../lib/backup-drive-page.server';
export const dynamic='force-dynamic';
export async function GET(req:Request){return driveBrowserResult(await finishDrive(req,env as DriveEnv))}
