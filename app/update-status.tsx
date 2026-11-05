'use client';
import {dataHealth} from '../lib/data-health';
export default function UpdateStatus({data}:{data:any}){
 const health=data.health||dataHealth(data),c=health.counts;
 const stamp=(s:string)=>new Date(s).toLocaleString('ru-RU',{timeZone:'Asia/Tbilisi',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 return <section className={'updateStatus '+(health.status==='updated'?'isCurrent':'')} aria-label="Актуальность данных" role="status"><strong>{health.status==='updated'?'Данные проверены':'Данные обновлены частично'}</strong><span>Свежие блоки: {c.fresh} из {health.total}. {c.partial?`Неполное покрытие: ${c.partial}. `:''}{c.unavailable?`Источник недоступен: ${c.unavailable}. `:''}{c.stale?`Нужна повторная проверка: ${c.stale}. `:''}{c.snapshot?`Ручные срезы: ${c.snapshot}. `:''}{c.missing?`Нет данных: ${c.missing}.`:''}</span><small>{data.lastAttempt?`Сводки: последняя попытка ${stamp(data.lastAttempt)} · Тбилиси. `:'Проверяю сохранённые данные. '}{health.refereeChecksOverdue?'Проверка арбитров просрочена или выполнена не для всех турниров.':`Последняя проверка арбитров: ${stamp(health.lastRefereeCheck)}.`} Дата проверки не гарантирует полноту данных поставщика.</small></section>
}
