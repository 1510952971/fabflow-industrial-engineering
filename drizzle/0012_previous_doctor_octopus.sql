CREATE TABLE `catalog_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`candidate_code` text NOT NULL,
	`proposed_product_name` text NOT NULL,
	`category_id` text NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`rfq_number` text DEFAULT '' NOT NULL,
	`technical_query_number` text DEFAULT '' NOT NULL,
	`requirement_snapshot_json` text NOT NULL,
	`vendor_data_json` text DEFAULT '{}' NOT NULL,
	`promoted_product_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`assigned_to` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `project_product_requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promoted_product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_candidates_project_code_uq` ON `catalog_candidates` (`project_id`,`candidate_code`);--> statement-breakpoint
CREATE INDEX `catalog_candidates_requirement_idx` ON `catalog_candidates` (`requirement_id`,`status`);--> statement-breakpoint
CREATE TABLE `equipment_material_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`equipment_model_id` text NOT NULL,
	`component_id` text NOT NULL,
	`material_id` text NOT NULL,
	`run_id` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`score` integer NOT NULL,
	`selected_by` text NOT NULL,
	`selected_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_model_id`) REFERENCES `equipment_models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `equipment_components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `selection_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_material_selections_project_component_uq` ON `equipment_material_selections` (`project_id`,`component_id`);--> statement-breakpoint
CREATE INDEX `equipment_material_selections_model_idx` ON `equipment_material_selections` (`project_id`,`equipment_model_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_configurations` (
	`project_id` text PRIMARY KEY NOT NULL,
	`template_code` text DEFAULT 'FAB_FULL' NOT NULL,
	`number_prefix` text NOT NULL,
	`default_waste_pct` real DEFAULT 5 NOT NULL,
	`system_template_json` text DEFAULT '[]' NOT NULL,
	`file_categories_json` text DEFAULT '[]' NOT NULL,
	`workflow_status` text DEFAULT 'initialized' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `release_gates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`gate_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`revision` text DEFAULT 'A' NOT NULL,
	`approval_request_id` text,
	`validation_snapshot_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_by` text NOT NULL,
	`frozen_by` text,
	`frozen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approval_request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_gates_entity_revision_uq` ON `release_gates` (`project_id`,`gate_type`,`entity_type`,`entity_id`,`revision`);--> statement-breakpoint
CREATE INDEX `release_gates_project_status_idx` ON `release_gates` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `release_gates_approval_idx` ON `release_gates` (`approval_request_id`);--> statement-breakpoint
CREATE TABLE `technical_spec_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`file_name` text NOT NULL,
	`parser_type` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`extracted_json` text NOT NULL,
	`confidence_json` text DEFAULT '{}' NOT NULL,
	`text_excerpt` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `project_product_requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `technical_spec_extractions_requirement_idx` ON `technical_spec_extractions` (`requirement_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `technical_spec_extractions_project_status_idx` ON `technical_spec_extractions` (`project_id`,`status`);