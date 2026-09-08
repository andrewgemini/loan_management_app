CREATE TABLE `user_dashboard_preset_category_move_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`preset_ids` text NOT NULL,
	`previous_category_ids` text NOT NULL,
	`destination_category_id` int,
	`undone_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_dashboard_preset_category_move_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `user_dashboard_preset_category_move_history_user_created_index` ON `user_dashboard_preset_category_move_history` (`user_id`,`created_at`);