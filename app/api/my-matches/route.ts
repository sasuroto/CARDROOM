import {env} from 'cloudflare:workers';
import {readCache,writeCache} from '../../../lib/cache';
import {sanitizeState} from '../../../lib/selection-tracker';
export const dynamic='force-dynamic';

// Per-account storage for My Matches. The user ID is set by the Sites edge after
// "Sign in with ChatGPT"; without it the client keeps selections on the device only.
const user=(req:Request)=>{const id=req.headers.get('oai-authenticated-user-id');return id&&/^[\w-]{3,128}$/.test(id)?id:null};
const key=(id:string)=>`my-matches/v1/${id}.json`;
const bucketOf=()=>(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
const headers={'Cache-Control':'no-store'};

export async function GET(req:Request){
 const id=user(req);if(!id)return Response.json({signedIn:false},{headers});
 const saved=sanitizeState(await readCache(bucketOf(),key(id)));
 return Response.json({signedIn:true,state:saved},{headers});
}
export async function PUT(req:Request){
 const id=user(req);if(!id)return Response.json({signedIn:false},{status:401,headers});
 const text=await req.text();if(text.length>200000)return Response.json({error:'Слишком большой список'},{status:413,headers});
 let body:any;try{body=JSON.parse(text)}catch{return Response.json({error:'Некорректные данные'},{status:400,headers})}
 const state=sanitizeState(body);if(!state)return Response.json({error:'Некорректные данные'},{status:400,headers});
 const bucket=bucketOf();if(!bucket)return Response.json({error:'Хранилище недоступно'},{status:503,headers});
 await writeCache(bucket,key(id),state);
 return Response.json({signedIn:true,saved:true,updatedAt:state.updatedAt},{headers});
}
