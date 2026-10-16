CREATE TABLE `ranking_view_events` (
	`target_id` varchar(64) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ranking_view_target_event_unique` UNIQUE(`target_id`,`event_id`)
);
--> statement-breakpoint
CREATE TABLE `ranking_view_totals` (
	`id` varchar(64) NOT NULL,
	`kind` varchar(24) NOT NULL,
	`target_key` varchar(600) NOT NULL,
	`total` int unsigned NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ranking_view_totals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ranking_view_event_created_idx` ON `ranking_view_events` (`created_at`);
