CREATE TABLE `public_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`media_id` varchar(32) NOT NULL,
	`author_id` int NOT NULL,
	`author_name` varchar(60) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`text` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `public_comments_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_comment_retry_unique` UNIQUE(`media_id`,`author_id`,`client_id`)
);
--> statement-breakpoint
ALTER TABLE `public_comments` ADD CONSTRAINT `public_comments_media_id_public_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `public_media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `public_comments` ADD CONSTRAINT `public_comments_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `public_comment_media_sequence_idx` ON `public_comments` (`media_id`,`id`);--> statement-breakpoint
CREATE INDEX `public_comment_author_time_idx` ON `public_comments` (`author_id`,`created_at`);