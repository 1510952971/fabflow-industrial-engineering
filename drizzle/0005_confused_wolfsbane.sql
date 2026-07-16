CREATE TABLE `approval_step_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`step_name` text NOT NULL,
	`action` text NOT NULL,
	`actor_email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_step_request_index_uq` ON `approval_step_decisions` (`request_id`,`step_index`);--> statement-breakpoint
CREATE INDEX `approval_step_request_idx` ON `approval_step_decisions` (`request_id`);--> statement-breakpoint
CREATE TABLE `integration_connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_system` text NOT NULL,
	`display_name` text NOT NULL,
	`mode` text NOT NULL,
	`endpoint_url` text,
	`cursor` text,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`last_sync_at` text,
	`last_success_at` text,
	`last_error` text,
	`retry_limit` integer DEFAULT 5 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_connectors_project_source_uq` ON `integration_connectors` (`project_id`,`source_system`);--> statement-breakpoint
CREATE INDEX `integration_connectors_status_idx` ON `integration_connectors` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `record_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer NOT NULL,
	`operation` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_versions_entity_version_uq` ON `record_versions` (`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE INDEX `record_versions_project_idx` ON `record_versions` (`project_id`,`created_at`);