export type AdvanceRow={league:string;home:string;away:string;day?:string;from?:string;until?:string;referee:string;assistants?:string[];videoOfficials?:string[];var?:string|null;avar?:string|null;fourthOfficial?:string|null;source:string;checkedAt?:string;stale?:boolean};
export const plain=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;|\u00a0/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
export function links(html:string,base:string){return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap(m=>{try{return [{url:new URL(plain(m[1]),base).href,title:plain(m[2])}]}catch{return []}})}
export function sitemapArticles(xml:string,pattern:RegExp,now=Date.now()){
 return [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)].flatMap(m=>{const url=m[1].match(/<loc>(.*?)<\/loc>/)?.[1],date=m[1].match(/<(?:news:publication_date|lastmod)>(.*?)<\//)?.[1];return url&&date&&pattern.test(url)&&Date.parse(date)>now-14*86400000&&Date.parse(date)<=now?[{url:plain(url),date}]:[]}).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3);
}
export function parseTFF(html:string,source:string):AdvanceRow[]{
 const headings=[...html.matchAll(/<span\b[^>]*id="[^"]*lblMacOrgAdi"[^>]*>([\s\S]*?)<\/span>/g)];
 const n=headings.findIndex(m=>/^Trendyol Süper Lig\b/.test(plain(m[1])));if(n<0)throw Error('TFF: Süper Lig section missing');
 const section=html.slice(headings[n].index!,headings[n+1]?.index||html.length),rows:AdvanceRow[]=[];
 for(const block of section.split(/<div class="row haftaninMaclariMaclar">/).slice(1)){
  const date=block.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/),home=block.match(/id="[^"]*_hypEvSahibi"[^>]*>([\s\S]*?)<\/a>/),away=block.match(/id="[^"]*_hypMisafir"[^>]*>([\s\S]*?)<\/a>/);
  const roles=[...block.matchAll(/id="[^"]*_hakem"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>plain(m[1]).match(/^\((H|Y|D|V|A)\)\s*(.+)$/)).filter(Boolean) as RegExpMatchArray[];
  const role=(r:string)=>roles.find(m=>m[1]===r)?.[2]||null;
  if(!date||!home||!away||!role('H'))continue;
  rows.push({league:'superlig',day:`${date[3]}-${date[2]}-${date[1]}`,home:plain(home[1]),away:plain(away[1]),referee:role('H')!,assistants:roles.filter(m=>m[1]==='Y').map(m=>m[2]),fourthOfficial:role('D'),var:role('V'),avar:role('A'),source});
 }
 if(!rows.length)throw Error('TFF: no appointments parsed');return rows;
}
export function parseSerieA(html:string,source:string):AdvanceRow[]{
 const publication=html.match(/property="article:published_time" content="(\d{4}-\d{2}-\d{2})/)?.[1];
 if(!publication||!html.includes('Serie A'))throw Error('Serie A: publication date or competition missing');
 const paragraphs=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>plain(m[1]));let day='';const rows:AdvanceRow[]=[];
 for(let i=0;i<paragraphs.length-1;i++){
  const m=paragraphs[i].match(/^([A-ZÀ-Ü .]+)\s+[–—]\s+([A-ZÀ-Ü .]+)\s+(.*)$/);if(!m)continue;
  const date=m[3].match(/\b(\d{1,2})\/(\d{1,2})\b/);if(date){let year=Number(publication.slice(0,4));if(Number(publication.slice(5,7))===12&&Number(date[2])===1)year++;day=`${year}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`;}
  if(!day||Math.abs(Date.parse(day)-Date.parse(publication))>8*86400000)continue;
  const crew=paragraphs[i+1].match(/^(.+?)\s*\((.+?)\s+[–—]\s+(.+?)\)\s*IV:\s*(.+?),\s*VAR:\s*(.+?),\s*AVAR:\s*(.+)$/);if(!crew)continue;
  rows.push({league:'seriea',day,home:m[1].trim(),away:m[2].trim(),referee:crew[1],assistants:[crew[2],crew[3]],fourthOfficial:crew[4],var:crew[5],avar:crew[6],source});
 }
 if(!rows.length)throw Error('Serie A: no appointments parsed');return rows;
}
export function parseLigue1(html:string,source:string):AdvanceRow[]{
 const publication=html.match(/property="article:published_time" content="(\d{4}-\d{2}-\d{2})/)?.[1];
 if(!publication||!/journée de Ligue 1/.test(plain(html)))throw Error('Ligue 1: publication or competition missing');
 const until=new Date(Date.parse(publication)+7*86400000).toISOString().slice(0,10),rows:AdvanceRow[]=[];
 for(const p of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)){
  const fixture=links(p[1],source).find(l=>l.url.startsWith('https://ligue1.com/fr/match-sheet/l1_championship_match_'));
  const pair=fixture?.title.split(/\s+[–—]\s+/);if(!pair||pair.length!==2)continue;
  const text=plain(p[1]),crew=text.match(/Arbitre principal\s*:\s*(.+?)\s+Arbitres assistants\s*:\s*(.+?)\s+4e arbitre\s*:\s*(.+?)\s+Arbitres assistants vidéo\s*:\s*(.+)$/);
  if(!crew)continue;const video=crew[4].split(/\s+et\s+/);
  rows.push({league:'ligue1',home:pair[0],away:pair[1],from:publication,until,referee:crew[1],assistants:crew[2].split(/\s+et\s+/),fourthOfficial:crew[3],videoOfficials:video,source});
 }
 if(!rows.length)throw Error('Ligue 1: no appointments parsed');return rows;
}
