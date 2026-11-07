import {env} from 'cloudflare:workers';
import {driveStatus,type DriveEnv} from '../../../../lib/backup-drive.server';
export const dynamic='force-dynamic';
export async function GET(req:Request){return driveStatus(req,env as DriveEnv)}
