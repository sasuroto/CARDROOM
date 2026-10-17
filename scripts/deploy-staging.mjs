// Isolated staging deploy of the current checkout to the owner's own Cloudflare account.
// Separate Worker name and separate R2 bucket: production (ChatGPT Sites, BUCKET site-creator-r2)
// is never touched. Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
//
//   node scripts/deploy-staging.mjs            # build + deploy
//   node scripts/deploy-staging.mjs --dry-run  # build + validate config, no upload
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const NAME=process.env.STAGING_WORKER_NAME||'cardroom-referees-staging';
const BUCKET=process.env.STAGING_R2_BUCKET||'cardroom-referees-staging';
const PRODUCTION={workers:['site-creator-vinext-starter','cardroom-europe'],buckets:['site-creator-r2']};
const dry=process.argv.includes('--dry-run');
const wrangler=(args,opts={})=>execFileSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,stdio:'inherit',...opts});

if(PRODUCTION.workers.includes(NAME)||PRODUCTION.buckets.includes(BUCKET)||!/staging|test/.test(NAME+BUCKET))
 throw Error(`Отказ: ${NAME} / ${BUCKET} похожи на production. Staging-имена должны содержать «staging» или «test».`);
if(!dry&&(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID))
 throw Error('Нужны CLOUDFLARE_API_TOKEN и CLOUDFLARE_ACCOUNT_ID в настройках среды.');

execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit'});
const source=path.join(root,'dist/server/wrangler.json'),target=path.join(root,'dist/server/wrangler.staging.json');
const config=JSON.parse(readFileSync(source,'utf8'));
Object.assign(config,{
 name:NAME,topLevelName:NAME,workers_dev:true,preview_urls:false,
 r2_buckets:[{binding:'BUCKET',bucket_name:BUCKET}],
 // Staging runs the rotation itself: one league per 10 minutes, same limits as /api/referee-journal?next=1.
 triggers:{crons:['*/10 * * * *']},
 vars:{...(config.vars||{}),CARDROOM_ENV:'staging'},
});
if(config.routes||config.route)throw Error('Отказ: в конфигурации есть маршруты домена — staging публикуется только на workers.dev.');
writeFileSync(target,JSON.stringify(config));
console.log(`Staging: Worker ${NAME}, R2 ${BUCKET}, cron */10, только workers.dev.`);
if(dry){wrangler(['deploy','--config',target,'--dry-run']);process.exit(0)}
try{wrangler(['r2','bucket','create',BUCKET],{stdio:'pipe'});console.log('R2 bucket создан.')}
catch(error){if(!String(error.stderr||error.stdout||error).includes('already exists'))throw error;console.log('R2 bucket уже существует.')}
wrangler(['deploy','--config',target]);
