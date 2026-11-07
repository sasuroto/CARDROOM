// ESPN summary uses logos[], while scoreboard commonly uses logo.
export function logoUrl(value:unknown):string|undefined{
 if(typeof value!=='string'||!value.trim())return undefined;
 try{const url=new URL(value.trim());return ['https:','http:'].includes(url.protocol)?url.href:undefined}catch{return undefined}
}
export function teamLogo(team:any):string|undefined{
 return logoUrl(team?.logo)||(Array.isArray(team?.logos)?team.logos.map((item:any)=>logoUrl(item?.href)).find(Boolean):undefined);
}
