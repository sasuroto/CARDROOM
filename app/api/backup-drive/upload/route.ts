import {env} from 'cloudflare:workers';
import {driveUploadRoute} from '../../../../lib/backup-drive-upload-route.server';
import type {UploadEnv} from '../../../../lib/backup-drive-upload.server';
export const dynamic='force-dynamic';
export const POST=(req:Request)=>driveUploadRoute(req,env as UploadEnv);
// Explicit safe rejections retain security headers and never start a backup.
export const GET=POST,HEAD=POST,OPTIONS=POST,PUT=POST,PATCH=POST,DELETE=POST;
