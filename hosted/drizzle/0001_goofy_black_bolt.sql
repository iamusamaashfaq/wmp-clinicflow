CREATE TABLE IF NOT EXISTS `platform_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`clinic_id` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`doctor` text NOT NULL,
	`specialty` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`fee` integer NOT NULL,
	`status` text NOT NULL,
	`plan` text NOT NULL,
	`subscription_end` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`reception_username` text NOT NULL,
	`reception_salt` text NOT NULL,
	`reception_hash` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `platform_clinics_slug_unique` ON `platform_clinics` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `platform_users_email_unique` ON `platform_users` (`email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_clinic_state` (
	`clinic_id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_integration` (
	`clinic_id` text PRIMARY KEY NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`last_delivery` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_staff_sessions` (
	`clinic_id` text NOT NULL,
	`token` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_subscribers` (
	`clinic_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
