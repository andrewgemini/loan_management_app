CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`email_new_loan_request` boolean NOT NULL DEFAULT true,
	`email_loan_approval` boolean NOT NULL DEFAULT true,
	`email_loan_rejection` boolean NOT NULL DEFAULT true,
	`email_payment_reminder` boolean NOT NULL DEFAULT true,
	`email_payment_confirmation` boolean NOT NULL DEFAULT true,
	`line_new_loan_request` boolean NOT NULL DEFAULT true,
	`line_loan_approval` boolean NOT NULL DEFAULT true,
	`line_loan_rejection` boolean NOT NULL DEFAULT true,
	`line_payment_reminder` boolean NOT NULL DEFAULT true,
	`line_payment_confirmation` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_user_id_unique` UNIQUE(`user_id`)
);
