CREATE TABLE `user_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipient_id` int NOT NULL,
	`actor_id` int NOT NULL,
	`comment_id` int NOT NULL,
	`media_id` varchar(32) NOT NULL,
	`kind` enum('comment','reply') NOT NULL,
	`root_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`read_at` timestamp,
	CONSTRAINT `user_notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_comment_recipient_unique` UNIQUE(`comment_id`,`recipient_id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` int NOT NULL,
	`display_name` varchar(60) NOT NULL,
	`handle` varchar(24) NOT NULL,
	`bio` varchar(160) NOT NULL,
	`location` varchar(80) NOT NULL,
	`website` varchar(200) NOT NULL,
	`category` varchar(40) NOT NULL,
	`avatar` longblob,
	`avatar_mime` varchar(32),
	`cover` longblob,
	`cover_mime` varchar(32),
	`revision` varchar(32) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `public_media` ADD `owner_user_id` int;--> statement-breakpoint
ALTER TABLE `user_notifications` ADD CONSTRAINT `user_notifications_recipient_id_users_id_fk` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notifications` ADD CONSTRAINT `user_notifications_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notifications` ADD CONSTRAINT `user_notifications_comment_id_public_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `public_comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notifications` ADD CONSTRAINT `user_notifications_media_id_public_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `public_media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notification_recipient_sequence_idx` ON `user_notifications` (`recipient_id`,`id`);--> statement-breakpoint
CREATE INDEX `notification_recipient_read_idx` ON `user_notifications` (`recipient_id`,`read_at`);--> statement-breakpoint
ALTER TABLE `public_media` ADD CONSTRAINT `public_media_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;