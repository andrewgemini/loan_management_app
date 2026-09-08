CREATE TABLE `user_dashboard_preset_recent_uses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`preset_id` int NOT NULL,
	`last_used_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_dashboard_preset_recent_uses_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_dashboard_preset_recent_uses_user_preset_unique` UNIQUE(`user_id`,`preset_id`)
);
