import {useEffect,useState} from 'react';
import {summaryBlockStatuses,snapshotDateLabel,type SummaryData,type SummaryLeague} from '../lib/summary-presentation';

export default function SummaryFreshness({data,league}:{data:SummaryData;league:SummaryLeague}){
 const [,tick]=useState(0);
 useEffect(()=>{const id=setInterval(()=>tick(value=>value+1),60000);return()=>clearInterval(id)},[]);
 return <section className="summaryFreshness" aria-label="Актуальность сводки турнира">
  <p>Сезон {league.season} · Последнее успешное чтение каждого блока</p>
  <dl>{summaryBlockStatuses(data,league).map(block=><div key={block.key} data-state={block.state}>
   <dt>{block.label}</dt>
   <dd><strong>{block.statusLabel}</strong><span>{block.checkedAt?<time dateTime={block.checkedAt}>{snapshotDateLabel(block.checkedAt)}</time>:snapshotDateLabel(null)}</span><span>{block.description}</span><span>{block.sampleSize!==null?'N = '+block.sampleSize+' матчей':'Размер выборки не подтверждён'}</span>{block.source&&<a href={block.source} target="_blank" rel="noreferrer">Источник ↗</a>}</dd>
  </div>)}</dl>
 </section>;
}
