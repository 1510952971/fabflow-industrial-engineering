CREATE TABLE `catalog_selection_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`product_id` text NOT NULL,
	`score` integer NOT NULL,
	`status` text NOT NULL,
	`checks_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `catalog_selection_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_selection_results_run_product_uq` ON `catalog_selection_results` (`run_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `catalog_selection_results_run_idx` ON `catalog_selection_results` (`run_id`,`score`);--> statement-breakpoint
CREATE TABLE `catalog_selection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`status` text NOT NULL,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`blocked_count` integer DEFAULT 0 NOT NULL,
	`submitted_by` text NOT NULL,
	`input_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `project_product_requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `catalog_selection_runs_requirement_idx` ON `catalog_selection_runs` (`requirement_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `catalog_selection_runs_project_idx` ON `catalog_selection_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_product_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`requirement_code` text NOT NULL,
	`title` text NOT NULL,
	`system_code` text NOT NULL,
	`category_id` text NOT NULL,
	`attachment_id` text,
	`source_file_name` text DEFAULT '' NOT NULL,
	`source_revision` text DEFAULT 'A' NOT NULL,
	`medium` text DEFAULT '' NOT NULL,
	`design_pressure_mpa` real,
	`design_temperature_c` real,
	`nominal_size` text DEFAULT '' NOT NULL,
	`connection_standard` text DEFAULT '' NOT NULL,
	`required_materials_json` text DEFAULT '[]' NOT NULL,
	`required_certifications_json` text DEFAULT '[]' NOT NULL,
	`required_standards_json` text DEFAULT '[]' NOT NULL,
	`required_brands_json` text DEFAULT '[]' NOT NULL,
	`required_specifications_json` text DEFAULT '{}' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`selected_product_id` text,
	`selected_variant_id` text,
	`selection_status` text DEFAULT 'unmatched' NOT NULL,
	`selected_by` text,
	`selected_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_product_requirements_project_code_uq` ON `project_product_requirements` (`project_id`,`requirement_code`);--> statement-breakpoint
CREATE INDEX `project_product_requirements_project_status_idx` ON `project_product_requirements` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `project_product_requirements_category_idx` ON `project_product_requirements` (`category_id`);