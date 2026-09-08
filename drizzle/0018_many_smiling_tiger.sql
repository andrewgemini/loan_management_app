CREATE TABLE `user_dashboard_preset_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_dashboard_preset_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_dashboard_preset_categories_user_name_unique` UNIQUE(`user_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `user_dashboard_preset_category_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`preset_id` int NOT NULL,
	`category_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_dashboard_preset_category_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_dashboard_preset_category_assignments_user_preset_unique` UNIQUE(`user_id`,`preset_id`)
);
--> statement-breakpoint
CREATE INDEX `user_dashboard_preset_category_assignments_user_category_index` ON `user_dashboard_preset_category_assignments` (`user_id`,`category_id`);