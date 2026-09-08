CREATE TABLE `user_dashboard_preset_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`preset_id` int NOT NULL,
	`pinned_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_dashboard_preset_pins_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_dashboard_preset_pins_user_preset_unique` UNIQUE(`user_id`,`preset_id`)
);
