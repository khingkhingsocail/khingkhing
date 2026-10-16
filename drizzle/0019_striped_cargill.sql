CREATE TABLE `feed_preference_events` (
	`user_id` int NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`media_id` varchar(32) NOT NULL,
	`action` enum('like','unlike','save','unsave','watch','skip','not-interested') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feed_pref_user_event_unique` UNIQUE(`user_id`,`event_id`)
);
--> statement-breakpoint
CREATE TABLE `feed_preferences` (
	`user_id` int NOT NULL,
	`payload` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feed_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `feed_preference_events` ADD CONSTRAINT `feed_preference_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feed_preference_events` ADD CONSTRAINT `feed_preference_events_media_id_public_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `public_media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feed_preferences` ADD CONSTRAINT `feed_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `feed_pref_event_created_idx` ON `feed_preference_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `feed_pref_event_user_created_idx` ON `feed_preference_events` (`user_id`,`created_at`);