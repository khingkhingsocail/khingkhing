CREATE TABLE `arena_entries` (
	`id` varchar(32) NOT NULL,
	`profile_id` varchar(32) NOT NULL,
	`board_key` varchar(80) NOT NULL,
	`title` varchar(60) NOT NULL,
	`category` enum('sports','stocks','followers','likes','world') NOT NULL,
	`unit` varchar(20) NOT NULL,
	`direction` enum('higher','lower') NOT NULL,
	`value` decimal(22,6) NOT NULL,
	`period` varchar(7) NOT NULL,
	`observed_at` varchar(10) NOT NULL,
	`evidence_url` varchar(500) NOT NULL,
	`verification` enum('self-reported','verified') NOT NULL DEFAULT 'self-reported',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `arena_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `arena_profile_board_period_unique` UNIQUE(`profile_id`,`board_key`,`period`)
);
--> statement-breakpoint
CREATE TABLE `arena_profiles` (
	`id` varchar(32) NOT NULL,
	`display_name` varchar(60) NOT NULL,
	`handle` varchar(24) NOT NULL,
	`bio` varchar(160) NOT NULL,
	`avatar` text,
	`edit_token_hash` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `arena_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `arena_profiles_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
ALTER TABLE `arena_entries` ADD CONSTRAINT `arena_entries_profile_id_arena_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `arena_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `arena_board_period_idx` ON `arena_entries` (`board_key`,`period`);