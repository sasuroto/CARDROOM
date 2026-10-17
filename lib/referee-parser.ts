import {clean,tableRows} from './data';
export function parseReferees(html:string,balonario=false,limit=18){
 const rows=tableRows(html).flat();
 const refs:any[]=[];
 for(const row of rows){
  if(balonario){
   if(row.length<8||!/^\d+$/.test(row[1])||!/^\d+(\.\d+)?$/.test(row[2]))continue;
   const n=+row[1];refs.push({name:row[0],n,yellow:+row[2],yellowN:n,red:+row[3]/n,redN:n,fouls:+row[5],foulsN:n,penalties:+row[6],results:row[7]});
  }else{
   const n=row[1]?.match(/^(\d+)\s*Matches/),y=row[2]?.match(/Yellow cards\s*([\d.]+)\s*Sample of\s*(\d+)/),r=row[3]?.match(/Red cards\s*([\d.]+)\s*Sample of\s*(\d+)/),f=row[4]?.match(/Fouls\s*([\d.]+)\s*Sample of\s*(\d+)/);
   if(!n||!y||!r||!f)continue;
   refs.push({name:row[0].replace(/View profile/g,'').replace(/^[A-ZÁÉÍÓÚÑ]{1,3}\s+/,'').trim(),n:+n[1],yellow:+y[1],yellowN:+y[2],red:+r[1],redN:+r[2],fouls:+f[1],foulsN:+f[2]});
  }
 }
 const valid=refs.filter(r=>r.name&&r.n>0&&r.yellow>=0&&r.yellow<20&&r.red>=0&&r.red<5&&r.fouls>=0&&r.fouls<80);
 if(!valid.length)throw Error('Таблица судей недоступна или формат изменился');
 return valid.sort((a,b)=>b.n-a.n).slice(0,limit);
}

export function parseSoccerbase(html:string){
 const table=tableRows(html).find(t=>t.some(r=>r.some(c=>c.includes('YELLOW CARDS'))&&r.some(c=>c.includes('GAMES'))));
 if(!table)throw Error('Таблица Soccerbase не найдена');
 const rows=table.filter(r=>r.length>=5&&/^\d+$/.test(r[2])&&/^\d+$/.test(r[3])&&/^\d+$/.test(r[4])).map(r=>({name:r[0],n:+r[2],yellowTotal:+r[3],yellow:+r[3]/+r[2],yellowN:+r[2],red:+r[4]/+r[2],redN:+r[2],fouls:null,foulsN:null})).filter(r=>r.n>0&&r.yellow<20);
 if(!rows.length)throw Error('Нет строк Soccerbase');return rows;
}
