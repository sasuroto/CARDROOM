import {env} from 'cloudflare:workers';
import {resultsQuery,readJournal} from '../../../lib/results-journal';
import {readExactJournal} from '../../../lib/exact-score-journal';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 let period;try{period=resultsQuery(req.url)}catch(e){return Response.json({status:'invalid',error:e instanceof Error?e.message:'Некорректный период'},{status:400})}
 const db=(env as unknown as {DB?:D1Database}).DB;
 if(!db)return Response.json({status:'unavailable',error:'Постоянный журнал не подключён'},{status:503});
 try{return Response.json({...await readJournal(db,period),exactScore11:await readExactJournal(db,period)},{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({status:'unavailable',error:'Не удалось прочитать постоянный журнал; это не отсутствие результатов'},{status:503})}
}
