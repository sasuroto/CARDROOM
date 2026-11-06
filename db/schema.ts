import {sqliteTable,text,index} from 'drizzle-orm/sqlite-core';
// Append-only application journal. No UPDATE/DELETE operations in its writer.
export const forecasts=sqliteTable('journal_forecasts',{
 matchKey:text('match_key').primaryKey(),league:text('league').notNull(),day:text('day').notNull(),
 committedAt:text('committed_at').notNull(),payload:text('payload').notNull(),
},t=>[index('journal_forecasts_day').on(t.day,t.league)]);
export const observations=sqliteTable('journal_observations',{
 id:text('id').primaryKey(),matchKey:text('match_key').notNull(),league:text('league').notNull(),day:text('day').notNull(),
 kind:text('kind').notNull(),observedAt:text('observed_at').notNull(),checkedAt:text('checked_at').notNull(),
 digest:text('digest').notNull(),payload:text('payload').notNull(),
},t=>[index('journal_observations_day').on(t.day,t.league),index('journal_observations_match').on(t.matchKey,t.kind,t.checkedAt)]);
