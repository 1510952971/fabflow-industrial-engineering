CREATE TABLE `catalog_source_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`source_document_id` text NOT NULL,
	`candidate_key` text NOT NULL,
	`product_name` text DEFAULT '' NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`category_hint` text DEFAULT '' NOT NULL,
	`systems_json` text DEFAULT '[]' NOT NULL,
	`parameters_json` text DEFAULT '{}' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`promoted_product_id` text,
	`review_note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_document_id`) REFERENCES `catalog_source_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promoted_product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_source_candidates_key_uq` ON `catalog_source_candidates` (`candidate_key`);--> statement-breakpoint
CREATE INDEX `catalog_source_candidates_source_status_idx` ON `catalog_source_candidates` (`source_document_id`,`status`);--> statement-breakpoint
CREATE INDEX `catalog_source_candidates_model_idx` ON `catalog_source_candidates` (`model`);--> statement-breakpoint
CREATE TABLE `catalog_source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`source_root` text DEFAULT '' NOT NULL,
	`relative_path` text NOT NULL,
	`file_name` text NOT NULL,
	`extension` text NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`modified_at` text,
	`sha256` text,
	`document_type` text DEFAULT 'other' NOT NULL,
	`parser_type` text DEFAULT 'manual_review' NOT NULL,
	`manufacturer_hint` text DEFAULT '' NOT NULL,
	`product_family_hint` text DEFAULT '' NOT NULL,
	`model_hint` text DEFAULT '' NOT NULL,
	`source_revision` text DEFAULT '' NOT NULL,
	`extraction_status` text DEFAULT 'queued' NOT NULL,
	`extracted_json` text DEFAULT '{}' NOT NULL,
	`error_message` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_source_documents_key_uq` ON `catalog_source_documents` (`source_key`);--> statement-breakpoint
CREATE INDEX `catalog_source_documents_type_status_idx` ON `catalog_source_documents` (`document_type`,`extraction_status`);--> statement-breakpoint
CREATE INDEX `catalog_source_documents_manufacturer_idx` ON `catalog_source_documents` (`manufacturer_hint`);--> statement-breakpoint
CREATE INDEX `catalog_source_documents_path_idx` ON `catalog_source_documents` (`relative_path`);