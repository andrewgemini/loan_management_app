CREATE TABLE `activity_history_filter_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`start_date` varchar(10) NOT NULL DEFAULT '',
	`end_date` varchar(10) NOT NULL DEFAULT '',
	`event_type` varchar(160) NOT NULL DEFAULT 'all',
	`actor_name` varchar(255) NOT NULL DEFAULT 'all',
	`actor_role` varchar(32) NOT NULL DEFAULT 'all',
	`lender_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activity_history_filter_presets_id` PRIMARY KEY(`id`)
);
