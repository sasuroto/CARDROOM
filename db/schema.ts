import {sqliteTable,text,index,integer} from 'drizzle-orm/sqlite-core';
// Independent immutable extension: old forecasts remain byte-for-byte unchanged.
export const exactForecasts=sqliteTable('journal_exact11',{
 matchKey:text('match_key').primaryKey(),league:text('league').notNull(),day:text('day').notNull(),
 committedAt:text('committed_at').notNull(),payload:text('payload').notNull(),
},t=>[index('journal_exact11_day').on(t.day,t.league)]);
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

// Separate from the append-only football journal; never exported in archives.
// Fixed 'primary' slots bound to the configured Site owner. No runtime DDL.
export const backupDriveFlow=sqliteTable('backup_drive_flow',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),stateHash:text('state_hash').notNull(),
 browserHash:text('browser_hash').notNull(),sealed:text('sealed').notNull(),
 startedAt:integer('started_at').notNull(),expiresAt:integer('expires_at').notNull(),
 consumedAt:integer('consumed_at'),retryAt:integer('retry_at').notNull().default(0),
 lastError:text('last_error'),
});
export const backupDriveConnection=sqliteTable('backup_drive_connection',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),revision:text('revision').notNull(),
 sealed:text('sealed').notNull(),
});
