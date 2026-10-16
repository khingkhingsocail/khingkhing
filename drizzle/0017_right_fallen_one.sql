CREATE TABLE `public_media_chunks` (
	`media_id` varchar(32) NOT NULL,
	`sequence` int unsigned NOT NULL,
	`data` longblob NOT NULL,
	CONSTRAINT `public_media_chunk_sequence_unique` UNIQUE(`media_id`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `public_upload_chunks` (
	`upload_id` varchar(32) NOT NULL,
	`sequence` int unsigned NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`data` longblob NOT NULL,
	CONSTRAINT `public_upload_chunk_sequence_unique` UNIQUE(`upload_id`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `public_upload_sessions` (
	`id` varchar(32) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`owner_user_id` int,
	`title` varchar(100) NOT NULL,
	`description` varchar(240) NOT NULL,
	`filename` varchar(160) NOT NULL,
	`size` int unsigned NOT NULL,
	`state` enum('uploading','processing','complete') NOT NULL DEFAULT 'uploading',
	`processing_key` varchar(32),
	`expires_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_upload_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `public_media` ADD `storage_mode` enum('blob','chunks') DEFAULT 'blob' NOT NULL;--> statement-breakpoint
ALTER TABLE `public_media_chunks` ADD CONSTRAINT `public_media_chunks_media_id_public_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `public_media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `public_upload_chunks` ADD CONSTRAINT `public_upload_chunks_upload_id_public_upload_sessions_id_fk` FOREIGN KEY (`upload_id`) REFERENCES `public_upload_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `public_upload_sessions` ADD CONSTRAINT `public_upload_sessions_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `public_upload_expiry_idx` ON `public_upload_sessions` (`expires_at`);
