import {env} from 'cloudflare:workers';
import {drivePage} from '../../lib/backup-drive-page.server';
import type {DriveEnv} from '../../lib/backup-drive.server';
export const dynamic='force-dynamic';
export async function GET(req:Request){return drivePage(req,env as DriveEnv)}
