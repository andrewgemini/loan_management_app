CREATE TABLE `admin_export_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`can_export_csv` boolean NOT NULL DEFAULT true,
	`can_export_pdf` boolean NOT NULL DEFAULT true,
	`can_verify_references` boolean NOT NULL DEFAULT true,
	`can_view_team_download_history` boolean NOT NULL DEFAULT false,
	`can_manage_export_permissions` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_export_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_export_permissions_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `report_download_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`format` enum('csv','pdf') NOT NULL,
	`reference_code` varchar(64),
	`filter_summary` varchar(1200) NOT NULL DEFAULT '',
	`row_count` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_download_history_id` PRIMARY KEY(`id`)
);
