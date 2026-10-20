// Storage is an optional cache. A failed read/write must not hide source data.
export async function readCache(bucket:R2Bucket|undefined,key:string){
 try {const value=await bucket?.get(key);return value?await value.json<any>():null} catch {return null}
}
export async function writeCache(bucket:R2Bucket|undefined,key:string,value:unknown){
 try {if(bucket)await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})} catch { /* keep the successful response available */ }
}
// For state that must survive: write, read back and compare the revision, so a lost
// write is reported instead of being shown as an update.
export async function writeVerified(bucket:R2Bucket|undefined,key:string,value:{revision:string}){
 const at=new Date().toISOString();
 if(!bucket)return {ok:false,at,error:'Постоянное хранилище не подключено'};
 try{await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})}catch(e){return {ok:false,at,error:'Запись не выполнена: '+String((e as Error)?.message||e)}}
 const saved=await readCache(bucket,key);
 return saved?.revision===value.revision?{ok:true,at,error:null}:{ok:false,at,error:'Запись не подтверждена при повторном чтении'};
}
