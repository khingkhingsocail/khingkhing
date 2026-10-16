CREATE TABLE `public_media_view_events` (
	`media_id` varchar(32) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_media_view_event_unique` UNIQUE(`media_id`,`event_id`)
);
--> statement-breakpoint
CREATE TABLE `public_media_view_totals` (
	`media_id` varchar(32) NOT NULL,
	`total` int unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `public_media_view_totals_media_id` PRIMARY KEY(`media_id`)
);
--> statement-breakpoint
ALTER TABLE `public_media_view_events` ADD CONSTRAINT `public_media_view_events_media_id_public_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `public_media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `public_media_view_totals` ADD CONSTRAINT `public_media_view_totals_media_id_public_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `public_media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `public_media_view_event_time_idx` ON `public_media_view_events` (`created_at`);
