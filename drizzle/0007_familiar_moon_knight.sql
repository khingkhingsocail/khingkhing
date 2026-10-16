ALTER TABLE `public_comments` ADD `parent_id` int;--> statement-breakpoint
ALTER TABLE `public_comments` ADD `reply_to_id` int;--> statement-breakpoint
ALTER TABLE `public_comments` ADD `reply_to_name` varchar(60);--> statement-breakpoint
CREATE INDEX `public_comment_thread_sequence_idx` ON `public_comments` (`media_id`,`parent_id`,`id`);