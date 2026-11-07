CREATE TABLE `backup_drive_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision` text NOT NULL,
	`sealed` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_drive_flow` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`state_hash` text NOT NULL,
	`browser_hash` text NOT NULL,
	`sealed` text NOT NULL,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
