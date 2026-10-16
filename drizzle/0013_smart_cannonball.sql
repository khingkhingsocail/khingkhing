CREATE TABLE `investment_public_references` (
	`id` varchar(80) NOT NULL,
	`kind` enum('investor','fund','company') NOT NULL,
	`payload` mediumtext NOT NULL,
	`imported_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `investment_public_references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `investment_reference_kind_idx` ON `investment_public_references` (`kind`);