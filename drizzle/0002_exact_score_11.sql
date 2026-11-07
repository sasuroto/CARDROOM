CREATE TABLE `journal_exact11` (
	`match_key` text PRIMARY KEY NOT NULL,
	`league` text NOT NULL,
	`day` text NOT NULL,
	`committed_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_exact11_day` ON `journal_exact11` (`day`,`league`);