CREATE TABLE `arena_public_references` (
	`id` varchar(32) NOT NULL,
	`person_id` varchar(80) NOT NULL,
	`category` enum('sports','stocks','followers','likes','world') NOT NULL,
	`board_key` varchar(80) NOT NULL,
	`payload` mediumtext NOT NULL,
	`imported_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `arena_public_references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `arena_public_reference_category_idx` ON `arena_public_references` (`category`);