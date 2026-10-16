CREATE TABLE `arena_evidence` (
	`id` varchar(32) NOT NULL,
	`entry_id` varchar(32) NOT NULL,
	`claim_revision` varchar(32) NOT NULL,
	`filename` varchar(100) NOT NULL,
	`kind` enum('image','video') NOT NULL,
	`mime_type` varchar(32) NOT NULL,
	`size` int NOT NULL,
	`data` longblob NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`duration` decimal(10,3),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `arena_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `arena_reviews` (
	`id` varchar(32) NOT NULL,
	`entry_id` varchar(32) NOT NULL,
	`profile_id` varchar(32) NOT NULL,
	`snapshot` varchar(64) NOT NULL,
	`status` varchar(20) NOT NULL,
	`report` mediumtext,
	`sources` mediumtext,
	`coverage` text,
	`model` varchar(100) NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`error` varchar(500),
	`decision` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`decision_reason` text,
	`reviewer_id` int,
	`decided_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `arena_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `arena_review_entry_snapshot_unique` UNIQUE(`entry_id`,`snapshot`)
);
--> statement-breakpoint
ALTER TABLE `arena_entries` ADD `revision` varchar(32) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `arena_entries` ADD `evidence_revision` varchar(32) DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE `arena_entries` ADD `review_status` varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `arena_entries` ADD `review_snapshot` varchar(64);--> statement-breakpoint
ALTER TABLE `arena_entries` ADD `verification_snapshot` varchar(64);--> statement-breakpoint
ALTER TABLE `arena_evidence` ADD CONSTRAINT `arena_evidence_entry_id_arena_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `arena_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `arena_reviews` ADD CONSTRAINT `arena_reviews_entry_id_arena_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `arena_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `arena_evidence_entry_revision_idx` ON `arena_evidence` (`entry_id`,`claim_revision`);--> statement-breakpoint
CREATE INDEX `arena_review_profile_created_idx` ON `arena_reviews` (`profile_id`,`created_at`);