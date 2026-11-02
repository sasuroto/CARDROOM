import type {ReactNode} from 'react';

/** Navigation aid only: an icon says which statistic this is, never whether data exists. */
export const CATEGORY_ALIASES: Record<string, string> = {
  goals25: 'goals', home: 'goals', away: 'goals', btts: 'goals', result: 'result', double: 'result',
  corners95: 'corners', yellow45: 'yellow', teams: 'yellow',
  matches: 'calendar', appointed: 'calendar', history: 'history',
  standings: 'table', clubs: 'teams', players: 'teams', lineups: 'teams',
  referees: 'referee', overview: 'analysis', draws: 'result',
  research: 'sources', scenarios: 'analysis', numbers: 'all', other: 'all',
};
const shapes: Record<string, ReactNode> = {
  goals: <><circle cx="12" cy="12" r="9"/><path d="m12 7 4.8 3.5-1.8 5.6H9l-1.8-5.6L12 7Zm0 0V3m4.8 7.5 3.7-1.2M15 16.1l2.3 3.2M9 16.1l-2.3 3.2m.5-8.8L3.5 9.3"/></>,
  yellow: <rect x="6.5" y="3" width="11" height="18" rx="2"/>,
  red: <><rect x="6.5" y="3" width="11" height="18" rx="2"/><path d="m10 9 4 6m0-6-4 6"/></>,
  corners: <><path d="M5 21V3l12 4-12 4M2 21h19M5 16a5 5 0 0 1 5 5"/></>,
  shots: <><path d="M4 18 20 4m-9 0h9v9M4 8V4h4"/><circle cx="5" cy="18" r="3"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  fouls: <><path d="m9 4 6 2-2 6 4 4-2 5m-2-9-5 3-4-1m7-7-5 3-3-2M17 5l3-2m-2 6h4"/><circle cx="14" cy="3" r="1.5"/></>,
  offsides: <><path d="M5 21V3h14l-3 4 3 4H5m8 3v7m5-7v7"/></>,
  saves: <><path d="M8 12V6a2 2 0 0 1 4 0v5-6a2 2 0 0 1 4 0v7-3a2 2 0 0 1 4 0v7a6 6 0 0 1-6 6h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l1 1Z"/></>,
  possession: <><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5v5.5h5.5A9 9 0 0 0 15 3.5Z"/></>,
  result: <><path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v5m-4 3h8m-7-3h6M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/></>,
  teams: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></>,
  referee: <><path d="M8 9h8l4-3v8l-4-3M8 9a5 5 0 1 0 5 5v-3"/><circle cx="8" cy="14" r="1.5"/><path d="m8 4 1-2m4 3 2-2"/></>,
  analysis: <><path d="M3 3v18h18M7 16v-4m5 4V7m5 9v-7"/></>,
  events: <><path d="M7 3v18m4-15h10m-10 6h7m-7 6h10"/><circle cx="7" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></>,
  sources: <><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M9 15 21 3m-6 0h6v6M7 7h3M7 11h2"/></>,
  history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2"/></>,
  calculator: <><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/></>,
  all: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
};
export const CATEGORY_ICON_KEYS = Object.keys(shapes);
export function categoryIconKey(category: string): string {
  return CATEGORY_ALIASES[category] || (shapes[category] ? category : 'all');
}
export default function CategoryIcon({category}: {category: string}) {
  const key = categoryIconKey(category);
  return <svg className={'categoryIcon categoryIcon--' + key} data-category={key} aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[key]}</svg>;
}
