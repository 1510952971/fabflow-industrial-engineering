CREATE TABLE `bom_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`system_id` text,
	`material_id` text,
	`item_code` text NOT NULL,
	`item_name` text NOT NULL,
	`specification` text DEFAULT '' NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT '件' NOT NULL,
	`unit_price_cny` real DEFAULT 0 NOT NULL,
	`waste_pct` real DEFAULT 5 NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bom_items_project_idx` ON `bom_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `bom_items_system_idx` ON `bom_items` (`system_id`);--> statement-breakpoint
CREATE INDEX `bom_items_material_idx` ON `bom_items` (`material_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `bom_items` (`id`,`project_id`,`system_id`,`material_id`,`item_code`,`item_name`,`specification`,`quantity`,`unit`,`unit_price_cny`,`waste_pct`,`source_type`,`status`) VALUES
('bom-vcr-4-ep','proj-fab2a','sys-utl','mat-kuze-316lep','VCR-4-EP','VCR 面密封接头','1/4” · 316L EP',240,'件',186,5,'catalog','draft'),
('bom-tube-8-ba','proj-fab2a','sys-utl',NULL,'TUBE-8-BA','BA 不锈钢管','1/2” × 1.24 mm',180,'m',92,5,'catalog','draft'),
('bom-pfa-6-f','proj-fab2a','sys-wtr',NULL,'PFA-6-F','PFA 扩口接头','3/8” · HP PFA',96,'件',128,5,'catalog','draft'),
('bom-upw-pvdf','proj-fab2a','sys-wtr',NULL,'UPW-PVDF','PVDF 隔膜阀','DN15 · HP PVDF',48,'件',460,5,'catalog','draft'),
('bom-bolt-m5','proj-fab2a','sys-ctrl',NULL,'BOLT-M5','四组合螺栓副','M5 × 8 · 304',960,'套',2.6,5,'calculation','draft');
