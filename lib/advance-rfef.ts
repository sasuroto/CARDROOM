import {getDocumentProxy} from 'unpdf';
import {links,plain,type AdvanceRow} from './advance-parsers';
// The federation landing page only lists four notices; the linked archive also
// contains Friday appointments needed for the previous Tbilisi calendar day.
export const RFEF_INDEX='https://rfef.es/es/noticias/arbitros/designaciones?designaciones=';
export async function parseRFEFPdf(bytes:Uint8Array,league:string,source:string):Promise<AdvanceRow[]>{
 if(bytes.length>3_000_000)throw Error('RFEF: document too large');
 const pdf=await getDocumentProxy(bytes,{useSystemFonts:false,disableFontFace:true});
 try{
  if(pdf.numPages>4)throw Error('RFEF: unexpected document length');
  const rows:AdvanceRow[]=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
   const page=await pdf.getPage(pageNumber),content=await page.getTextContent();
   const items=content.items.filter((i:any)=>typeof i.str==='string') as any[];
   const text=items.map(i=>i.str).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   const division=league==='laliga'?'Primera':'Segunda';
   if(!new RegExp(division+'\\s+Division','i').test(text)||!/TEMPORADA\s+20\d{2}\s*[-/]\s*20\d{2}/i.test(text))throw Error('RFEF: competition/season not confirmed');
   const season=text.match(/TEMPORADA\s+(20\d{2})\s*[-/]\s*(20\d{2})/i)!;
   const lines:{y:number,items:any[]}[]=[];
   for(const item of items){const y=item.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<1);if(!line){line={y,items:[]};lines.push(line)}line.items.push(item)}
   lines.sort((a,b)=>b.y-a.y);let current:AdvanceRow|null=null;
   const finish=()=>{if(current?.referee&&current.home&&current.away)rows.push(current);current=null};
   for(const line of lines){
    const sorted=line.items.sort((a,b)=>a.transform[4]-b.transform[4]);
    const join=(min:number,max:number)=>sorted.filter(i=>i.transform[4]>=min&&i.transform[4]<max).map(i=>i.str).join(' ').trim();
    const date=join(0,100).match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if(date){finish();const day=`${date[3]}-${date[2]}-${date[1]}`;if(day<`${season[1]}-07-01`||day>`${season[2]}-07-01`)throw Error('RFEF: date outside season');current={league,day,home:join(100,300),away:join(300,510),referee:'',assistants:[],source};continue}
    if(!current)continue;
    for(const cell of [join(0,300),join(300,600)]){
     const m=cell.match(/^(Árbitro|A\.\s*Asistente\s*[12]|4[º°o]\s*Árbitro|VAR|AVAR)\s*:\s*(.+)$/i);if(!m)continue;
     if(/^Árbitro$/i.test(m[1]))current.referee=m[2];else if(/^A\./i.test(m[1]))current.assistants!.push(m[2]);else if(/^4/.test(m[1]))current.fourthOfficial=m[2];else if(m[1].toUpperCase()==='VAR')current.var=m[2];else current.avar=m[2];
    }
   }
   finish();
  }
  if(!rows.length)throw Error('RFEF: no appointments parsed');return rows;
 }finally{await pdf.loadingTask.destroy()}
}
export async function loadRFEF(league:string,read:(url:string,binary?:boolean)=>Promise<any>,previous:string[]=[]){
 const index=await read(RFEF_INDEX),division=league==='laliga'?'primera':'segunda';
 const found=links(index,RFEF_INDEX).filter(l=>l.url.startsWith('https://rfef.es/es/noticias/')&&new RegExp('en '+division+' División$','i').test(l.title)&&/Designaciones/i.test(l.title)).map(l=>l.url);
 const sources=[...new Set([...found,...previous.filter(u=>u.startsWith('https://rfef.es/es/noticias/')&&u.includes('-en-'+division))])].slice(0,6),rows:AdvanceRow[]=[],errors:string[]=[];
 for(const url of sources){try{
  const article=await read(url),pdf=links(article,url).find(l=>l.url.startsWith('https://rfef.es/sites/default/files/designaciones_')&&l.url.includes(`_${league==='laliga'?'1':'2'}a_division_masculina`)&&/\.pdf(?:\?|$)/.test(l.url));
  if(!pdf)throw Error('RFEF: PDF link not found');
  rows.push(...await parseRFEFPdf(await read(pdf.url,true),league,pdf.url));
 }catch(e){errors.push(`${url}: ${String(e)}`);if(/HTTP (403|429)|cooldown/.test(String(e)))break}}
 if(!rows.length)throw Error(errors.join('; ')||'RFEF: no current documents');return {rows,sources,errors};
}
