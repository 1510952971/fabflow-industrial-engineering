CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workflow_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_step` integer DEFAULT 1 NOT NULL,
	`steps_json` text NOT NULL,
	`requested_by` text NOT NULL,
	`decided_by` text,
	`decision_note` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `approval_requests_project_status_idx` ON `approval_requests` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `approval_requests_entity_idx` ON `approval_requests` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`category` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`uploaded_by` text NOT NULL,
	`signed_by` text,
	`signed_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_uq` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`project_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`request_id` text NOT NULL,
	`source_ip` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_project_created_idx` ON `audit_logs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `equipment_components` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_model_id` text NOT NULL,
	`component_code` text NOT NULL,
	`component_name` text NOT NULL,
	`function` text NOT NULL,
	`medium` text NOT NULL,
	`allowed_materials_json` text NOT NULL,
	`required_finish` text NOT NULL,
	`required_cleanliness` text NOT NULL,
	`design_pressure_mpa` real NOT NULL,
	`design_temperature_c` real NOT NULL,
	`connection_standard` text NOT NULL,
	`nominal_size` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`criticality` text DEFAULT 'B' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`equipment_model_id`) REFERENCES `equipment_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_components_model_code_uq` ON `equipment_components` (`equipment_model_id`,`component_code`);--> statement-breakpoint
CREATE INDEX `equipment_components_model_idx` ON `equipment_components` (`equipment_model_id`);--> statement-breakpoint
CREATE TABLE `equipment_factories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`contact_email` text,
	`quality_status` text DEFAULT 'qualified' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_factories_code_uq` ON `equipment_factories` (`code`);--> statement-breakpoint
CREATE TABLE `equipment_models` (
	`id` text PRIMARY KEY NOT NULL,
	`factory_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`revision` text NOT NULL,
	`design_standard` text NOT NULL,
	`status` text DEFAULT 'released' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`factory_id`) REFERENCES `equipment_factories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_models_code_uq` ON `equipment_models` (`code`);--> statement-breakpoint
CREATE INDEX `equipment_models_factory_idx` ON `equipment_models` (`factory_id`);--> statement-breakpoint
CREATE TABLE `equipment_ports` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_model_id` text NOT NULL,
	`port_code` text NOT NULL,
	`service` text NOT NULL,
	`direction` text NOT NULL,
	`connection_standard` text NOT NULL,
	`nominal_size` text NOT NULL,
	`pressure_rating_mpa` real NOT NULL,
	`temperature_rating_c` real NOT NULL,
	`face_to_face_mm` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`equipment_model_id`) REFERENCES `equipment_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_ports_model_code_uq` ON `equipment_ports` (`equipment_model_id`,`port_code`);--> statement-breakpoint
CREATE INDEX `equipment_ports_model_idx` ON `equipment_ports` (`equipment_model_id`);--> statement-breakpoint
CREATE TABLE `integration_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`source_system` text NOT NULL,
	`event_type` text NOT NULL,
	`external_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_events_idempotency_uq` ON `integration_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `integration_events_status_idx` ON `integration_events` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `interfaces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`from_tag_id` text,
	`to_tag_id` text,
	`interface_code` text NOT NULL,
	`medium` text NOT NULL,
	`connection_standard` text NOT NULL,
	`nominal_size` text NOT NULL,
	`design_pressure_mpa` real NOT NULL,
	`design_temperature_c` real NOT NULL,
	`cleanliness_grade` text DEFAULT 'industrial' NOT NULL,
	`owner_discipline` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interfaces_project_code_uq` ON `interfaces` (`project_id`,`interface_code`);--> statement-breakpoint
CREATE INDEX `interfaces_project_idx` ON `interfaces` (`project_id`);--> statement-breakpoint
CREATE TABLE `material_compatibility` (
	`id` text PRIMARY KEY NOT NULL,
	`medium` text NOT NULL,
	`material_grade` text NOT NULL,
	`rating` text NOT NULL,
	`max_concentration_pct` real,
	`max_temperature_c` real,
	`notes` text DEFAULT '' NOT NULL,
	`source_standard` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_compatibility_medium_grade_uq` ON `material_compatibility` (`medium`,`material_grade`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`manufacturer` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`grade` text NOT NULL,
	`base_material` text NOT NULL,
	`surface_finish` text NOT NULL,
	`cleanliness_grade` text NOT NULL,
	`max_pressure_mpa` real NOT NULL,
	`min_temperature_c` real NOT NULL,
	`max_temperature_c` real NOT NULL,
	`certifications_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_code_uq` ON `materials` (`code`);--> statement-breakpoint
CREATE INDEX `materials_grade_idx` ON `materials` (`grade`);--> statement-breakpoint
CREATE TABLE `operational_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`source_system` text NOT NULL,
	`tag_no` text NOT NULL,
	`event_type` text NOT NULL,
	`severity` text NOT NULL,
	`value` real,
	`unit` text,
	`quality` text DEFAULT 'good' NOT NULL,
	`occurred_at` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operational_events_tag_time_idx` ON `operational_events` (`tag_no`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `operational_events_severity_idx` ON `operational_events` (`severity`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`region` text DEFAULT 'CN' NOT NULL,
	`fab` text DEFAULT 'FAB-2A' NOT NULL,
	`phase` text DEFAULT 'detailed_design' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_uq` ON `projects` (`code`);--> statement-breakpoint
CREATE TABLE `punch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`system_id` text,
	`punch_number` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`owner_email` text,
	`due_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `punch_items_project_number_uq` ON `punch_items` (`project_id`,`punch_number`);--> statement-breakpoint
CREATE INDEX `punch_items_status_idx` ON `punch_items` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`po_number` text NOT NULL,
	`supplier` text NOT NULL,
	`package_code` text NOT NULL,
	`amount_cny` real DEFAULT 0 NOT NULL,
	`promised_date` text,
	`status` text DEFAULT 'placed' NOT NULL,
	`source_system` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_project_po_uq` ON `purchase_orders` (`project_id`,`po_number`);--> statement-breakpoint
CREATE INDEX `purchase_orders_project_idx` ON `purchase_orders` (`project_id`);--> statement-breakpoint
CREATE TABLE `selection_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`rule_code` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`expected` text NOT NULL,
	`actual` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `selection_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `selection_results_run_idx` ON `selection_results` (`run_id`);--> statement-breakpoint
CREATE TABLE `selection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`equipment_model_id` text NOT NULL,
	`component_id` text,
	`status` text NOT NULL,
	`score` integer NOT NULL,
	`submitted_by` text NOT NULL,
	`input_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_model_id`) REFERENCES `equipment_models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `equipment_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `selection_runs_project_idx` ON `selection_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `systems` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`discipline` text NOT NULL,
	`owner_email` text,
	`design_maturity` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'design' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `systems_project_code_uq` ON `systems` (`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `systems_project_idx` ON `systems` (`project_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`system_id` text NOT NULL,
	`tag_no` text NOT NULL,
	`entity_type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`design_pressure_mpa` real,
	`design_temperature_c` real,
	`medium` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_project_tag_no_uq` ON `tags` (`project_id`,`tag_no`);--> statement-breakpoint
CREATE INDEX `tags_system_idx` ON `tags` (`system_id`);--> statement-breakpoint
CREATE TABLE `test_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`system_id` text,
	`pack_number` text NOT NULL,
	`title` text NOT NULL,
	`test_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`witness_required` integer DEFAULT false NOT NULL,
	`signed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `test_packs_project_number_uq` ON `test_packs` (`project_id`,`pack_number`);--> statement-breakpoint
CREATE INDEX `test_packs_system_idx` ON `test_packs` (`system_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`scope_type` text DEFAULT 'global' NOT NULL,
	`scope_id` text DEFAULT '*' NOT NULL,
	`granted_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_user_scope_uq` ON `user_roles` (`user_id`,`role`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `user_roles_user_idx` ON `user_roles` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);
--> statement-breakpoint
INSERT OR IGNORE INTO `projects` (`id`,`code`,`name`,`region`,`fab`,`phase`,`status`) VALUES ('proj-fab2a','FAB-2026-0715','先进制程 FAB 2A 厂务扩建项目','CN-East','FAB-2A','detailed_design','active');
--> statement-breakpoint
INSERT OR IGNORE INTO `systems` (`id`,`project_id`,`code`,`name`,`discipline`,`design_maturity`,`status`) VALUES
('sys-utl','proj-fab2a','UTL','动力公用工程','utilities',92,'design'),
('sys-cr','proj-fab2a','CR','洁净室与洁净包','cleanroom',84,'design'),
('sys-wtr','proj-fab2a','WTR','纯水与废水','water',88,'design'),
('sys-exh','proj-fab2a','EXH','工艺排风','exhaust',79,'design'),
('sys-fire','proj-fab2a','FIRE','消防与生命安全','fire',91,'design'),
('sys-ctrl','proj-fab2a','CTRL','机电自控与能源管理','controls',73,'design');
--> statement-breakpoint
INSERT OR IGNORE INTO `tags` (`id`,`project_id`,`system_id`,`tag_no`,`entity_type`,`description`,`design_pressure_mpa`,`design_temperature_c`,`medium`,`status`) VALUES
('tag-vmb-001','proj-fab2a','sys-utl','VMB-SIH4-001','equipment','四瓶位硅烷 VMB',1.0,60,'SiH4','approved'),
('tag-wb-101','proj-fab2a','sys-wtr','WB-ACID-101','equipment','湿法清洗台',0.6,80,'HCl','approved'),
('tag-upw-201','proj-fab2a','sys-wtr','UPW-SKD-201','equipment','UPW 二次增压与抛光单元',1.0,85,'UPW','approved');
--> statement-breakpoint
INSERT OR IGNORE INTO `interfaces` (`id`,`project_id`,`from_tag_id`,`to_tag_id`,`interface_code`,`medium`,`connection_standard`,`nominal_size`,`design_pressure_mpa`,`design_temperature_c`,`cleanliness_grade`,`owner_discipline`,`status`) VALUES
('if-gc-001','proj-fab2a','tag-vmb-001',NULL,'IF-GAS-001','SiH4','VCR','1/4”',1.0,60,'UHP','specialty_gas','open'),
('if-upw-001','proj-fab2a','tag-upw-201','tag-wb-101','IF-UPW-001','UPW','Weld','DN25',1.0,85,'UPW','water','open');
--> statement-breakpoint
INSERT OR IGNORE INTO `materials` (`id`,`manufacturer`,`code`,`name`,`grade`,`base_material`,`surface_finish`,`cleanliness_grade`,`max_pressure_mpa`,`min_temperature_c`,`max_temperature_c`,`certifications_json`,`status`) VALUES
('mat-316l-ep','FabFlow Approved','M-316L-EP','316L EP 管材与接头','316L','SS','EP','UHP',8.3,-40,180,'["EN10204 3.1","SEMI F20","Helium Leak Test"]','approved'),
('mat-316l-ba','FabFlow Approved','M-316L-BA','316L BA 管材与阀件','316L','SS','BA','HP',10.0,-40,200,'["EN10204 3.1","ASTM A269"]','approved'),
('mat-pfa-hp','FabFlow Approved','M-PFA-HP','HP PFA 接液件','PFA','PFA','HP PFA','HP',1.0,-20,120,'["SEMI F57","COC","Particle Cleanliness"]','approved'),
('mat-pvdf-hp','FabFlow Approved','M-PVDF-HP','HP PVDF 管阀件','PVDF','PVDF','HP PVDF','UPW',1.6,0,95,'["SEMI F57","ASTM D3222","TOC Extractable"]','approved'),
('mat-pph','FabFlow Approved','M-PPH','PP-H 酸碱排风件','PPH','PP','Smooth','Industrial',0.3,0,90,'["DVS 2205","Flame Retardant Report"]','approved'),
('mat-fkm','FabFlow Approved','M-FKM-UHP','UHP FKM 密封件','FKM','Elastomer','Molded','UHP',2.0,-20,150,'["Batch COC","Extractable Report"]','approved');
--> statement-breakpoint
INSERT OR IGNORE INTO `material_compatibility` (`id`,`medium`,`material_grade`,`rating`,`max_concentration_pct`,`max_temperature_c`,`notes`,`source_standard`) VALUES
('mc-sih4-316l','SiH4','316L','approved',100,120,'硅烷高纯系统批准使用 316L EP，必须执行氦检与吹扫','SEMI F20 / Project Material Spec'),
('mc-hcl-pfa','HCl','PFA','approved',37,100,'高纯盐酸接液件优先采用 HP PFA','Project Chemical Compatibility Matrix'),
('mc-hcl-316l','HCl','316L','conditional',1,25,'仅允许极低浓度、常温并经腐蚀评估后使用','Project Chemical Compatibility Matrix'),
('mc-hf-pfa','HF','PFA','approved',49,90,'HF 接液件批准使用 HP PFA','Project Chemical Compatibility Matrix'),
('mc-hf-pvdf','HF','PVDF','conditional',10,60,'受浓度和温度限制，必须复核供应商曲线','Project Chemical Compatibility Matrix'),
('mc-hf-316l','HF','316L','forbidden',1,25,'HF 与 316L 不兼容，禁止用于接液部件','Project Chemical Compatibility Matrix'),
('mc-upw-pvdf','UPW','PVDF','approved',100,85,'UPW 二次回路批准使用 HP PVDF','SEMI F57 / UPW Spec'),
('mc-upw-316l','UPW','316L','conditional',100,80,'仅限指定抛光等级并完成 TOC/离子析出验证','UPW Spec'),
('mc-cda-316l','CDA','316L','approved',100,150,'CDA 高洁净段允许 316L BA/EP','Utility Material Spec'),
('mc-acidexh-pph','Acid Exhaust','PPH','approved',100,80,'酸排风批准使用阻燃 PP-H，并按 DVS 焊接','DVS 2205 / Exhaust Spec');
--> statement-breakpoint
INSERT OR IGNORE INTO `equipment_factories` (`id`,`code`,`name`,`country`,`contact_email`,`quality_status`) VALUES
('fac-gas','FCT-001','Global Gas Equipment Works','CN','engineering@ggew.example','qualified'),
('fac-wet','FCT-002','Precision Wet Process Systems','SG','interface@pwps.example','qualified'),
('fac-water','FCT-003','UltraPure Systems Manufacturing','DE','projects@upsm.example','qualified');
--> statement-breakpoint
INSERT OR IGNORE INTO `equipment_models` (`id`,`factory_id`,`code`,`name`,`category`,`revision`,`design_standard`,`status`) VALUES
('eq-gc-04','fac-gas','GC-VMB-04','四瓶位特气 VMB 柜','Gas Delivery','Rev.C','SEMI S2 / NFPA 55','released'),
('eq-wb-300','fac-wet','WB-ACID-300','酸碱湿法清洗台','Wet Process','Rev.B','SEMI S2 / S8 / Project CDS Spec','released'),
('eq-upw-skid','fac-water','UPW-POL-200','UPW 二次抛光与增压 Skid','UPW Package','Rev.D','SEMI F63 / Project UPW Spec','released');
--> statement-breakpoint
INSERT OR IGNORE INTO `equipment_components` (`id`,`equipment_model_id`,`component_code`,`component_name`,`function`,`medium`,`allowed_materials_json`,`required_finish`,`required_cleanliness`,`design_pressure_mpa`,`design_temperature_c`,`connection_standard`,`nominal_size`,`quantity`,`criticality`) VALUES
('cmp-gc-vcr','eq-gc-04','GC-INT-001','内部高压主管','特气分配','SiH4','["316L"]','EP','UHP',1.0,60,'VCR','1/4”',4,'A'),
('cmp-gc-valve','eq-gc-04','GC-INT-002','气动隔膜阀','隔离与联锁切断','SiH4','["316L"]','EP','UHP',1.0,60,'VCR','1/4”',8,'A'),
('cmp-wb-hcl','eq-wb-300','WB-INT-001','HCl 内部主管','化学品分配','HCl','["PFA"]','HP PFA','HP',0.6,80,'Flare','3/8”',2,'A'),
('cmp-wb-hf','eq-wb-300','WB-INT-002','HF 排液支路','化学废液排放','HF','["PFA"]','HP PFA','HP',0.3,70,'Flare','1/2”',2,'A'),
('cmp-wb-exh','eq-wb-300','WB-INT-003','酸排风内衬风道','酸雾收集','Acid Exhaust','["PPH"]','Smooth','Industrial',0.05,60,'Flange','DN150',1,'A'),
('cmp-upw-loop','eq-upw-skid','UPW-INT-001','UPW 循环主管','二次抛光循环','UPW','["PVDF"]','HP PVDF','UPW',1.0,85,'Weld','DN25',1,'A'),
('cmp-upw-valve','eq-upw-skid','UPW-INT-002','零死角隔膜阀','流量调节与隔离','UPW','["PVDF"]','HP PVDF','UPW',1.0,85,'Weld','DN25',6,'A');
--> statement-breakpoint
INSERT OR IGNORE INTO `equipment_ports` (`id`,`equipment_model_id`,`port_code`,`service`,`direction`,`connection_standard`,`nominal_size`,`pressure_rating_mpa`,`temperature_rating_c`,`face_to_face_mm`) VALUES
('port-gc-p1','eq-gc-04','P-GAS-01','SiH4','OUT','VCR','1/4”',8.3,120,35),
('port-gc-n2','eq-gc-04','P-N2-01','N2','IN','VCR','1/4”',8.3,120,35),
('port-wb-hcl','eq-wb-300','P-HCL-01','HCl','IN','Flare','3/8”',1.0,100,42),
('port-wb-hf','eq-wb-300','P-HF-DRAIN','HF','OUT','Flare','1/2”',1.0,90,48),
('port-wb-exh','eq-wb-300','P-AEX-01','Acid Exhaust','OUT','Flange','DN150',0.3,80,120),
('port-upw-in','eq-upw-skid','P-UPW-IN','UPW','IN','Weld','DN25',1.6,95,110),
('port-upw-out','eq-upw-skid','P-UPW-OUT','UPW','OUT','Weld','DN25',1.6,95,110);
--> statement-breakpoint
INSERT OR IGNORE INTO `test_packs` (`id`,`project_id`,`system_id`,`pack_number`,`title`,`test_type`,`status`,`witness_required`) VALUES
('tp-utl-014','proj-fab2a','sys-utl','TP-UTL-014','CDA / N2 站房压力与露点','pressure_leak','approved',1),
('tp-wtr-022','proj-fab2a','sys-wtr','TP-WTR-022','UPW 循环冲洗与 TOC','flush_quality','in_progress',1);
--> statement-breakpoint
INSERT OR IGNORE INTO `punch_items` (`id`,`project_id`,`system_id`,`punch_number`,`category`,`description`,`due_date`,`status`) VALUES
('punch-a-001','proj-fab2a','sys-wtr','P-A-001','A','UPW Skid 接口材质证明待补齐','2026-08-20','open'),
('punch-b-004','proj-fab2a','sys-ctrl','P-B-004','B','BMS I/O 点表缺少报警优先级','2026-08-25','open');
