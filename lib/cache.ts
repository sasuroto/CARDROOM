// Storage is an optional cache. A failed read/write must not hide source data.
export async function readCache(bucket:R2Bucket|undefined,key:string){
 try {const value=await bucket?.get(key);return value?await value.json<any>():null} catch {return null}
}
export async function writeCache(bucket:R2Bucket|undefined,key:string,value:unknown){
 try {if(bucket)await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})} catch { /* keep the successful response available */ }
}
