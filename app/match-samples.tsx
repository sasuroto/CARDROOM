'use client';
import {useState} from 'react';
import {SAMPLE_METRICS, SAMPLE_FREQUENCIES, selectSample, sampleMean, sampleFrequency, samplePeriod, sharedSampleMatches} from '../lib/sample-stats';
import type {SampleEvent, SampleSize, SampleVenue} from '../lib/sample-stats';

const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('ru-RU', {timeZone: 'Asia/Tbilisi'}) : '—';
const numberLabel = (value: number | null, decimals = 1) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 ? '—' : value.toLocaleString('ru-RU', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
const venueLabel = (venue: SampleEvent['homeAway']) => venue === 'home' ? 'дома' : venue === 'away' ? 'в гостях' : 'поле не указано';

function HistoryRows({events}: {events: SampleEvent[]}) {
  return <ol className="sampleHistoryList">{events.map(event => <li key={event.id}>
    <div><span>{dateLabel(event.date)} · {venueLabel(event.homeAway)}</span><strong>{event.opponent || 'Соперник не указан'}</strong><small>{event.leagueName || 'Турнир не указан'}{event.season ? ' · ' + event.season : ''}</small></div>
    <div><b>{numberLabel(event.own?.goals ?? null, 0)} : {numberLabel(event.against?.goals ?? null, 0)}</b>{event.source && <a href={event.source} target="_blank" rel="noreferrer" aria-label={`Источник матча ${dateLabel(event.date)} с ${event.opponent || 'соперником'}`}>Источник ↗</a>}</div>
  </li>)}</ol>;
}

export default function MatchSamples({match, analysis, loading}: {match: any; analysis: any; loading: boolean}) {
  const [size, setSize] = useState<SampleSize>(10);
  const [venue, setVenue] = useState<SampleVenue>('all');
  const scope = {before: match.date, leagueName: analysis?.leagueName, season: analysis?.season};
  const sides = (['home', 'away'] as const).map(side => {
    const team = analysis?.teams?.find((row: any) => row.side === side);
    const history = team && analysis?.history?.find((row: any) => String(row.id) === String(team.id));
    const available = selectSample(history?.events, 'all', 'all', scope);
    const events = selectSample(available, size, venue, scope);
    return {side, id: team?.id, name: match[side], events, available, period: samplePeriod(events)};
  });
  const shared = sharedSampleMatches(sides[0].id, sides[1].id, sides[0].events, sides[1].events);
  const any = sides.some(side => side.available.length);
  return <section className="matchSamples" id={'samples-' + match.id} aria-label="Сравнение по прошлым играм">
    <div className="sampleHeading"><span className="eyebrow">ИСТОРИЯ КОМАНД</span><h3>Сравнение по прошлым играм</h3><p>Одна выборка для средних, частот и списка игр ниже. Только завершённые матчи до этой встречи в том же турнире и сезоне. Это факты истории, а не вероятность будущего события.</p></div>
    <div className="sampleFilters">
      <fieldset><legend>Последние доступные матчи</legend><div className="sampleSizeButtons">{([5, 10, 20, 'all'] as const).map(value => <button type="button" key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{value === 'all' ? 'Все доступные' : value}</button>)}</div></fieldset>
      <label>Поле каждой команды<select value={venue} onChange={event => setVenue(event.target.value as SampleVenue)}><option value="all">Все поля</option><option value="home">Дома</option><option value="away">В гостях</option></select></label>
    </div>
    <div className="sampleScopeCards" aria-live="polite">{sides.map(side => <div key={side.side}><b>{side.name}</b><strong>{side.events.length} из {side.available.length} загруженных игр</strong><small>{side.period ? dateLabel(side.period.from) + ' — ' + dateLabel(side.period.to) : 'Нет игр в выбранной выборке'}</small></div>)}</div>
    <p className="definition">{analysis?.leagueName || 'Турнир выбранного матча'}{analysis?.season ? ' · ' + analysis.season : ''} · даты по Тбилиси (UTC+4). «Все доступные» не означает полный сезон. N — число матчей с конкретным показателем; прочерк означает отсутствие данных.{venue !== 'all' ? ' Сначала выбирается поле, затем последние матчи. Игры без подтверждённого поля исключены.' : ''}</p>
    {!any ? <p className="notice" role="status">{loading ? 'Загружаю подтверждённую историю команд…' : 'История с подробной статистикой пока не получена. Средние и частоты не дополняются сезонными предположениями.'}</p> : <>
      <div className="sampleTableScroll" role="region" aria-label="Средние показатели выбранных матчей" tabIndex={0}><table className="sampleComparison"><caption>Среднее за матч · у каждой ячейки свой N</caption><thead><tr><th rowSpan={2} scope="col">Показатель</th>{sides.map(side => <th key={side.side} colSpan={2} scope="colgroup">{side.name}</th>)}</tr><tr>{sides.flatMap(side => [<th key={side.side + 'own'} scope="col">Своё</th>, <th key={side.side + 'against'} scope="col">У соперников</th>])}</tr></thead><tbody>{SAMPLE_METRICS.map(([metric, label]) => <tr key={metric}><th scope="row">{label}</th>{sides.flatMap(side => (['own', 'against'] as const).map(direction => {const item = sampleMean(side.events, metric, direction); return <td key={side.side + direction}><b>{numberLabel(item.value, metric === 'red' ? 2 : 1)}</b><small>N={item.n}</small></td>;}))}</tr>)}</tbody></table></div>
      <h4 className="sampleSubheading">Как часто это происходило</h4><div className="sampleFrequencyGrid">{SAMPLE_FREQUENCIES.map(([kind, label, explanation]) => <article key={kind}><h5>{label}</h5>{sides.map(side => {const item = sampleFrequency(side.events, kind);return <div className="sampleFrequencyRow" key={side.side}><span>{side.name}</span><b>{item.n ? `${item.count} из ${item.n}` : 'Нет данных'}{item.percent !== null && <small>{Math.round(item.percent)}%</small>}</b></div>;})}<p>{explanation} Учитываются игры с данными обеих сторон.</p></article>)}</div>
      <details className="sampleEvidenceList"><summary>Проверить матчи выбранной выборки</summary><p className="definition">Счёт указан со стороны соответствующей команды. Средние и частоты выше рассчитаны только по этим играм; состав доступных показателей может различаться.</p><div className="sampleHistoryTeams">{sides.map(side => <article key={side.side}><h4>{side.name} · {side.events.length}</h4>{side.events.length ? <HistoryRows events={side.events}/> : <p>Нет матчей с такими фильтрами.</p>}</article>)}</div></details>
      <details className="sampleEvidenceList"><summary>Очные встречи в выбранных историях · {shared.length}</summary><p className="definition">Совпадения подтверждены по ID матча в историях обеих команд и согласованному счёту. Показаны только встречи, попавшие в обе выбранные выборки; это не полный архив очных игр.</p>{shared.length ? <><p className="definition">Счёт со стороны {match.home}.</p><HistoryRows events={shared}/></> : <p>Общих подтверждённых матчей в этой выборке нет.{venue !== 'all' ? ' Для очных встреч выберите «Все поля»: одна команда играет дома, другая — в гостях.' : ''}</p>}</details>
    </>}
    <p className="definition sampleSeparation">Эти фильтры относятся только к сравнению выше. Факты текущей игры, выбор игроков и модель сценариев ниже имеют свои указанные источники и выборки.</p>
    {analysis?.checkedAt && Number.isFinite(Date.parse(analysis.checkedAt)) && <p className="definition">Проверено {new Date(analysis.checkedAt).toLocaleString('ru-RU', {timeZone: 'Asia/Tbilisi'})} · Тбилиси. {analysis?.source && <a href={analysis.source} target="_blank" rel="noreferrer">ESPN · источник ↗</a>}</p>}
  </section>;
}
