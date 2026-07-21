CREATE TABLE `catalog_product_facets` (
	`product_id` text NOT NULL,
	`facet_type` text NOT NULL,
	`normalized_value` text NOT NULL,
	`display_value` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_product_facets_uq` ON `catalog_product_facets` (`product_id`,`facet_type`,`normalized_value`);--> statement-breakpoint
CREATE INDEX `catalog_product_facets_lookup_idx` ON `catalog_product_facets` (`facet_type`,`normalized_value`,`product_id`);--> statement-breakpoint
CREATE INDEX `catalog_product_facets_product_idx` ON `catalog_product_facets` (`product_id`,`facet_type`);--> statement-breakpoint
CREATE TABLE `user_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`draft_type` text NOT NULL,
	`draft_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_drafts_user_key_uq` ON `user_drafts` (`user_id`,`draft_type`,`draft_key`);--> statement-breakpoint
CREATE INDEX `user_drafts_updated_idx` ON `user_drafts` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `attachments_browse_idx` ON `attachments` (`project_id`,`entity_type`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `attachments_version_idx` ON `attachments` (`project_id`,`entity_type`,`entity_id`,`category`,`version`);--> statement-breakpoint
CREATE INDEX `catalog_products_browse_idx` ON `catalog_products` (`category_id`,`updated_at`,`id`,`status`);
--> statement-breakpoint
CREATE INDEX `catalog_products_updated_idx` ON `catalog_products` (`updated_at`,`id`,`status`);--> statement-breakpoint
CREATE INDEX `catalog_products_brand_model_idx` ON `catalog_products` (`brand`,`model`,`id`);--> statement-breakpoint
CREATE INDEX `catalog_products_pressure_idx` ON `catalog_products` (`status`,`category_id`,`max_pressure_mpa`,`id`);--> statement-breakpoint
CREATE INDEX `catalog_products_temperature_idx` ON `catalog_products` (`status`,`category_id`,`max_temperature_c`,`id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `catalog_product_facets` (`product_id`,`facet_type`,`normalized_value`,`display_value`)
SELECT p.id, 'system', lower(replace(replace(replace(replace(trim(CAST(j.value AS text)),' ',''),'_',''),'-',''),'/','')), CAST(j.value AS text)
FROM catalog_products p, json_each(p.applicable_systems_json) j WHERE json_valid(p.applicable_systems_json);
--> statement-breakpoint
INSERT OR IGNORE INTO `catalog_product_facets` (`product_id`,`facet_type`,`normalized_value`,`display_value`)
SELECT p.id, 'medium', lower(replace(replace(replace(replace(trim(CAST(j.value AS text)),' ',''),'_',''),'-',''),'/','')), CAST(j.value AS text)
FROM catalog_products p, json_each(p.media_json) j WHERE json_valid(p.media_json);
--> statement-breakpoint
INSERT OR IGNORE INTO `catalog_product_facets` (`product_id`,`facet_type`,`normalized_value`,`display_value`)
SELECT p.id, 'material', lower(replace(replace(replace(replace(trim(CAST(j.value AS text)),' ',''),'_',''),'-',''),'/','')), CAST(j.value AS text)
FROM catalog_products p, json_each(p.wetted_materials_json) j WHERE json_valid(p.wetted_materials_json);
--> statement-breakpoint
INSERT OR IGNORE INTO `catalog_product_facets` (`product_id`,`facet_type`,`normalized_value`,`display_value`)
SELECT p.id, 'certification', lower(replace(replace(replace(replace(trim(CAST(j.value AS text)),' ',''),'_',''),'-',''),'/','')), CAST(j.value AS text)
FROM catalog_products p, json_each(p.certifications_json) j WHERE json_valid(p.certifications_json);
--> statement-breakpoint
INSERT OR IGNORE INTO `catalog_product_facets` (`product_id`,`facet_type`,`normalized_value`,`display_value`)
SELECT p.id, 'standard', lower(replace(replace(replace(replace(trim(CAST(j.value AS text)),' ',''),'_',''),'-',''),'/','')), CAST(j.value AS text)
FROM catalog_products p, json_each(p.standards_json) j WHERE json_valid(p.standards_json);