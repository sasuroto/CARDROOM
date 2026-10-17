// Portable counterpart to the managed Linux installer; retain the pinned lockfile.
import {spawnSync} from 'node:child_process';
const version='11.25.0';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const result=spawnSync(npm,['exec','--yes',`--package=pnpm@${version}`,'--','pnpm','install','--frozen-lockfile','--store-dir','.sites-runtime/pnpm-store'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
