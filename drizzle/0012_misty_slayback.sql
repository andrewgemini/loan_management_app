CREATE TABLE `user_dashboard_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`custom_range_start_date` varchar(10),
	`custom_range_end_date` varchar(10),
	`comparison_mode` enum('matching_period','previous_month','previous_quarter') NOT NULL DEFAULT 'matching_period',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_dashboard_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_dashboard_preferences_user_id_unique` UNIQUE(`user_id`)
);
