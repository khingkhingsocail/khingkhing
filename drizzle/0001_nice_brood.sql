CREATE TABLE `public_media` (
	`id` varchar(32) NOT NULL,
	`title` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`kind` enum('image','video') NOT NULL,
	`mime_type` varchar(32) NOT NULL,
	`size` int NOT NULL,
	`data` longblob NOT NULL,
	`delete_token_hash` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `public_media_created_at_id_idx` ON `public_media` (`created_at`,`id`);