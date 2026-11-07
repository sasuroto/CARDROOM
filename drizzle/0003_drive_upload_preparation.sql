CREATE TABLE `backup_drive_upload` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`binding` text NOT NULL,
	`run_key` text NOT NULL,
	`attempt_id` text NOT NULL,
	`file_id` text,
	`phase` text NOT NULL,
	`lease_until` integer NOT NULL,
	`archive_sha256` text,
	`wire_sha256` text,
	`wire_size` integer,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
