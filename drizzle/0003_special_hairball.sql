CREATE TABLE `construction_work_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`system_id` text,
	`package_number` text NOT NULL,
	`title` text NOT NULL,
	`area` text NOT NULL,
	`owner_email` text,
	`planned_start` text,
	`readiness_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cwp_project_number_uq` ON `construction_work_packages` (`project_id`,`package_number`);--> statement-breakpoint
CREATE INDEX `cwp_project_status_idx` ON `construction_work_packages` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `management_of_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`system_id` text,
	`moc_number` text NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`risk_level` text DEFAULT 'medium' NOT NULL,
	`cost_impact_cny` real DEFAULT 0 NOT NULL,
	`schedule_impact_days` integer DEFAULT 0 NOT NULL,
	`owner_email` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moc_project_number_uq` ON `management_of_changes` (`project_id`,`moc_number`);--> statement-breakpoint
CREATE INDEX `moc_project_status_idx` ON `management_of_changes` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `workflow_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`action_type` text NOT NULL,
	`title` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` text,
	`due_at` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`requested_by` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_actions_project_status_idx` ON `workflow_actions` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `workflow_actions_entity_idx` ON `workflow_actions` (`entity_type`,`entity_id`);