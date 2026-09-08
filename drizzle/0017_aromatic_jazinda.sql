ALTER TABLE `user_dashboard_preset_pins` ADD `sort_order` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_dashboard_preset_recent_uses` ADD `usage_count` int DEFAULT 0 NOT NULL;