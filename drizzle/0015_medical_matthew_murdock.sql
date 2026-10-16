CREATE TABLE `investor_return_references` (
	`id` varchar(80) NOT NULL,
	`payload` mediumtext NOT NULL,
	`imported_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `investor_return_references_id` PRIMARY KEY(`id`)
);
