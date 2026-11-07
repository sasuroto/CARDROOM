export type CacheReadResult = {status:'ok';value:any}|{status:'missing'|'unconfigured'|'error';value:null};
const warningAt=new Map<string,number>();
function storageWarning(operation:'read'|'write'){
 const now=Date.now(),previous=warningAt.get(operation);
 if(previous===undefined||now<previous||now-previous>=60000){warningAt.set(operation,now);console.warn(`[cardroom:storage] ${operation} failed`)}
}
// Operational checks must distinguish an empty key from a failed storage read.
export async function inspectCache(bucket:R2Bucket|undefined,key:string):Promise<CacheReadResult>{
 if(!bucket)return {status:'unconfigured',value:null};
 try{const value=await bucket.get(key);return value?{status:'ok',value:await value.json<any>()}:{status:'missing',value:null}}
 catch{storageWarning('read');return {status:'error',value:null}}
}
// Storage is an optional cache. A failed read/write must not hide source data.
export async function readCache(bucket:R2Bucket|undefined,key:string){
 return (await inspectCache(bucket,key)).value;
}
export async function writeCache(bucket:R2Bucket|undefined,key:string,value:unknown){
 try {if(bucket)await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})} catch {storageWarning('write'); /* keep the successful response available */ }
}
// For state that must survive: write, read back and compare the revision, so a lost
// write is reported instead of being shown as an update.
export async function writeVerified(bucket:R2Bucket|undefined,key:string,value:{revision:string}){
 const at=new Date().toISOString();
 if(!bucket)return {ok:false,at,error:'Постоянное хранилище не подключено'};
 try{await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})}catch(e){return {ok:false,at,error:'Запись в хранилище не выполнена'}}
 const saved=await readCache(bucket,key);
 return saved?.revision===value.revision?{ok:true,at,error:null}:{ok:false,at,error:'Запись не подтверждена при повторном чтении'};
}
