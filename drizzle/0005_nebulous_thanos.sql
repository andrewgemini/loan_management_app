CREATE TABLE `notification_preference_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`action` varchar(32) NOT NULL,
	`changed_fields` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_preference_audit_logs_id` PRIMARY KEY(`id`)
);
