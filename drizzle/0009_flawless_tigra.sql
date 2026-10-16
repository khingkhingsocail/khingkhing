CREATE TABLE `public_media_creators` (
	`id` varchar(32) NOT NULL,
	`user_id` int NOT NULL,
	`display_name` varchar(60) NOT NULL,
	`handle` varchar(24) NOT NULL,
	`avatar` longblob,
	`avatar_mime` varchar(32),
	`revision` varchar(32) NOT NULL,
	CONSTRAINT `public_media_creators_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_media_creators_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `public_media_creators` ADD CONSTRAINT `public_media_creators_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;