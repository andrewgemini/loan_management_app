CREATE TABLE `report_export_approval_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requester_id` int NOT NULL,
	`format` enum('csv','pdf') NOT NULL,
	`row_count` int NOT NULL,
	`filter_summary` varchar(1200) NOT NULL DEFAULT '',
	`status` enum('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
	`reviewed_by_id` int,
	`reviewer_note` varchar(500),
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	CONSTRAINT `report_export_approval_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_export_security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_id` int NOT NULL,
	`approval_request_id` int,
	`type` enum('high_volume_export','approval_requested','approval_approved','approval_rejected','retention_cleanup') NOT NULL,
	`severity` enum('info','warning','high') NOT NULL DEFAULT 'info',
	`row_count` int,
	`reference_code` varchar(64),
	`message` varchar(600) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_export_security_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_export_security_policy` (
	`id` int NOT NULL,
	`high_volume_row_threshold` int NOT NULL DEFAULT 500,
	`approval_row_threshold` int NOT NULL DEFAULT 750,
	`retention_days` int NOT NULL DEFAULT 365,
	`approval_expires_hours` int NOT NULL DEFAULT 24,
	`alert_owner_on_high_volume` boolean NOT NULL DEFAULT true,
	`updated_by_id` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `report_export_security_policy_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `report_download_history` ADD `approval_request_id` int;