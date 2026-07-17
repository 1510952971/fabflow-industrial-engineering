CREATE TABLE `integration_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`run_type` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`cursor_from` text,
	`cursor_to` text,
	`records_read` integer DEFAULT 0 NOT NULL,
	`records_written` integer DEFAULT 0 NOT NULL,
	`records_failed` integer DEFAULT 0 NOT NULL,
	`response_code` integer,
	`error_message` text,
	`requested_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connector_id`) REFERENCES `integration_connectors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `integration_sync_runs_project_idx` ON `integration_sync_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_sync_runs_connector_idx` ON `integration_sync_runs` (`connector_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `signature_envelopes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`evidence_attachment_id` text,
	`title` text NOT NULL,
	`signers_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`external_envelope_id` text,
	`requested_by` text NOT NULL,
	`submitted_at` text,
	`completed_at` text,
	`failed_at` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `signature_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `signature_envelopes_project_status_idx` ON `signature_envelopes` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `signature_envelopes_external_idx` ON `signature_envelopes` (`external_envelope_id`);--> statement-breakpoint
CREATE TABLE `signature_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider_type` text DEFAULT 'generic_rest' NOT NULL,
	`display_name` text NOT NULL,
	`endpoint_url` text NOT NULL,
	`auth_type` text DEFAULT 'bearer' NOT NULL,
	`credential_ref` text NOT NULL,
	`callback_secret_ref` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`last_health_check_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signature_providers_project_name_uq` ON `signature_providers` (`project_id`,`display_name`);--> statement-breakpoint
CREATE INDEX `signature_providers_status_idx` ON `signature_providers` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `adapter_profile` text DEFAULT 'erp_po' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `auth_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `credential_ref` text;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `field_mapping_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `inbound_allowlist_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `healthcheck_path` text;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `timeout_ms` integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `last_health_check_at` text;--> statement-breakpoint
ALTER TABLE `integration_connectors` ADD `verified_at` text;