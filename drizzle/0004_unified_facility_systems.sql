INSERT OR IGNORE INTO `systems` (`id`,`project_id`,`code`,`name`,`discipline`,`design_maturity`,`status`) VALUES
('sys-sgas','proj-fab2a','SGAS','电子特气 VMB','process_fluids',89,'design'),
('sys-cds','proj-fab2a','CDS','湿化学品 CDS','process_fluids',87,'design'),
('sys-hookup','proj-fab2a','HUP','机台二次配','process_fluids',74,'design'),
('sys-bsgs','proj-fab2a','BSGS','大宗气体 BSGS','utilities',92,'design'),
('sys-cda','proj-fab2a','CDA','压缩干燥空气 CDA','utilities',91,'design'),
('sys-pcw','proj-fab2a','PCW','工艺冷却水 PCW','utilities',86,'design'),
('sys-chw','proj-fab2a','CHW','冷冻水 CHW','utilities',84,'design'),
('sys-upw','proj-fab2a','UPW','超纯水 UPW','water',88,'design'),
('sys-wwt','proj-fab2a','WWT','废水处理 WWT','water',76,'design');
--> statement-breakpoint
UPDATE `tags` SET `system_id`='sys-sgas', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='tag-vmb-001';
--> statement-breakpoint
UPDATE `tags` SET `system_id`='sys-cds', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='tag-wb-101';
--> statement-breakpoint
UPDATE `tags` SET `system_id`='sys-upw', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='tag-upw-201';
--> statement-breakpoint
UPDATE `bom_items` SET `system_id`='sys-sgas', `source_id`='sys-sgas:VCR-4-EP', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='bom-vcr-4-ep';
--> statement-breakpoint
UPDATE `bom_items` SET `system_id`='sys-bsgs', `source_id`='sys-bsgs:TUBE-8-BA', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='bom-tube-8-ba';
--> statement-breakpoint
UPDATE `bom_items` SET `system_id`='sys-cds', `source_id`='sys-cds:PFA-6-F', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='bom-pfa-6-f';
--> statement-breakpoint
UPDATE `bom_items` SET `system_id`='sys-upw', `source_id`='sys-upw:UPW-PVDF', `updated_at`=CURRENT_TIMESTAMP WHERE `id`='bom-upw-pvdf';
