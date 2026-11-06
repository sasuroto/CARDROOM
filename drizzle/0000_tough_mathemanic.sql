CREATE TABLE `journal_forecasts` (
	`match_key` text PRIMARY KEY NOT NULL,
	`league` text NOT NULL,
	`day` text NOT NULL,
	`committed_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_forecasts_day` ON `journal_forecasts` (`day`,`league`);--> statement-breakpoint
CREATE TABLE `journal_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`match_key` text NOT NULL,
	`league` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`observed_at` text NOT NULL,
	`checked_at` text NOT NULL,
	`digest` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_observations_day` ON `journal_observations` (`day`,`league`);--> statement-breakpoint
CREATE INDEX `journal_observations_match` ON `journal_observations` (`match_key`,`kind`,`checked_at`);