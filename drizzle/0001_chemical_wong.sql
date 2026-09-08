CREATE TABLE `amortization_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loan_id` int NOT NULL,
	`payment_number` int NOT NULL,
	`due_date` date NOT NULL,
	`starting_balance` decimal(12,2) NOT NULL,
	`principal_due` decimal(12,2) NOT NULL,
	`interest_due` decimal(12,2) NOT NULL,
	`total_payment_due` decimal(12,2) NOT NULL,
	`ending_balance` decimal(12,2) NOT NULL,
	`is_paid` boolean DEFAULT false,
	CONSTRAINT `amortization_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loan_id` int NOT NULL,
	`schedule_id` int,
	`amount_paid` decimal(12,2) NOT NULL,
	`payment_date` timestamp NOT NULL DEFAULT (now()),
	`payment_method` varchar(50) NOT NULL,
	`slip_path` varchar(255),
	`verified_by_id` int,
	`verified_at` timestamp,
	`status` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
	`rejection_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loan_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`borrower_id` int NOT NULL,
	`amount_requested` decimal(12,2) NOT NULL,
	`interest_rate` decimal(5,2) NOT NULL,
	`loan_term_months` int NOT NULL,
	`interest_type` enum('simple','compound') NOT NULL,
	`payment_type` enum('fixed','reducing') NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`approved_by_id` int,
	`approved_at` timestamp,
	`rejection_reason` text,
	CONSTRAINT `loan_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`borrower_id` int NOT NULL,
	`lender_id` int NOT NULL,
	`principal_amount` decimal(12,2) NOT NULL,
	`interest_rate` decimal(5,2) NOT NULL,
	`loan_term_months` int NOT NULL,
	`interest_type` enum('simple','compound') NOT NULL,
	`payment_type` enum('fixed','reducing') NOT NULL,
	`start_date` date NOT NULL,
	`next_payment_date` date NOT NULL,
	`total_paid` decimal(12,2) DEFAULT '0',
	`is_closed` boolean DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` enum('payment_due','loan_status','payment_verified','loan_approved','loan_rejected') NOT NULL,
	`message` text NOT NULL,
	`is_read` boolean DEFAULT false,
	`sent_via` varchar(50) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` varchar(255),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_line_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`line_token` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_line_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_line_tokens_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','lender','borrower') NOT NULL DEFAULT 'borrower';