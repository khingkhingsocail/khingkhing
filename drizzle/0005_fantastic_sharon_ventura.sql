CREATE TABLE `chat_accounts` (
	`user_id` int NOT NULL,
	`display_name` varchar(60) NOT NULL,
	`arena_profile_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_accounts_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `chat_accounts_arena_profile_id_unique` UNIQUE(`arena_profile_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_files` (
	`id` varchar(32) NOT NULL,
	`message_id` int NOT NULL,
	`sender_id` int NOT NULL,
	`filename` varchar(100) NOT NULL,
	`kind` enum('image','video') NOT NULL,
	`mime_type` varchar(32) NOT NULL,
	`size` int NOT NULL,
	`data` longblob NOT NULL,
	CONSTRAINT `chat_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`room_id` varchar(32) NOT NULL,
	`user_id` int NOT NULL,
	`state` enum('invited','active','left') NOT NULL,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_member_room_user_unique` UNIQUE(`room_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`room_id` varchar(32) NOT NULL,
	`sender_id` int NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`payload_hash` varchar(64) NOT NULL,
	`text` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_message_retry_unique` UNIQUE(`room_id`,`sender_id`,`client_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` varchar(32) NOT NULL,
	`kind` enum('direct','group','channel') NOT NULL,
	`title` varchar(100) NOT NULL,
	`owner_user_id` int NOT NULL,
	`direct_key` varchar(64),
	`channel_key` varchar(200),
	`category` enum('sports','stocks','followers','likes','world'),
	`board_key` varchar(80),
	`period` varchar(7),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_rooms_direct_key_unique` UNIQUE(`direct_key`),
	CONSTRAINT `chat_rooms_channel_key_unique` UNIQUE(`channel_key`)
);
--> statement-breakpoint
ALTER TABLE `chat_accounts` ADD CONSTRAINT `chat_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_accounts` ADD CONSTRAINT `chat_accounts_arena_profile_id_arena_profiles_id_fk` FOREIGN KEY (`arena_profile_id`) REFERENCES `arena_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_files` ADD CONSTRAINT `chat_files_message_id_chat_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_files` ADD CONSTRAINT `chat_files_sender_id_chat_accounts_user_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `chat_accounts`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_members` ADD CONSTRAINT `chat_members_room_id_chat_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_members` ADD CONSTRAINT `chat_members_user_id_chat_accounts_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `chat_accounts`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_room_id_chat_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_sender_id_chat_accounts_user_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `chat_accounts`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD CONSTRAINT `chat_rooms_owner_user_id_chat_accounts_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `chat_accounts`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chat_file_message_idx` ON `chat_files` (`message_id`);--> statement-breakpoint
CREATE INDEX `chat_file_sender_idx` ON `chat_files` (`sender_id`);--> statement-breakpoint
CREATE INDEX `chat_member_user_state_idx` ON `chat_members` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `chat_message_room_sequence_idx` ON `chat_messages` (`room_id`,`id`);