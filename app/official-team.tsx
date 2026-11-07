const stamp=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

export default function OfficialTeam({match:m}:{match:any}){
 const complete=m.crewComplete??(m.assistants?.length===2&&!!m.var&&!!m.avar&&!!m.fourthOfficial);
 const source=m.crewSource||m.appointmentSource||m.source,at=m.crewSource?m.crewCheckedAt:m.appointmentCheckedAt;
 const checked=at&&Number.isFinite(Date.parse(at))?stamp(at):null;
 return <section className="officialTeam" aria-label="Судейская бригада">
  <h3>Судейская бригада</h3>
  <dl>{[['Главный арбитр',m.referee],['Ассистенты',m.assistants?.join(' · ')],['VAR',m.var],['Ассистент VAR',m.avar],['Резервный арбитр',m.fourthOfficial]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Пока не получено'}</dd></div>)}</dl>
  {m.crewStale&&<p className="definition">Бригаду не удалось повторно подтвердить{checked?'; сохранённый срез от '+checked+' · Тбилиси':''}.</p>}
  <details className="serviceDisclosure"><summary>Источник и полнота бригады</summary>
   <p>{complete?'Все роли бригады получены.':'Бригада заполнена не полностью. Пустые поля не означают, что официального назначения нет.'}</p>
   {source?<p><a href={source} target="_blank" rel="noreferrer">{m.crewSource?'UEFA · официальная карточка матча':'Источник назначения'} ↗</a>{checked?' · проверено '+checked+' · Тбилиси (UTC+4)':''}</p>:<p>Источник полной бригады ещё не подтверждён.</p>}
   {m.crewError&&<p>{m.crewError}</p>}
   {m.crewPersisted===false&&<p>Сохранение этого ответа не подтверждено.</p>}
  </details>
 </section>;
}
