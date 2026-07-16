CREATE TABLE `material_approval_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_code` text NOT NULL,
	`package_code` text NOT NULL,
	`category_code` text NOT NULL,
	`item_name` text NOT NULL,
	`required_grade` text NOT NULL,
	`allowed_brands_json` text NOT NULL,
	`restrictions` text DEFAULT '' NOT NULL,
	`source_document` text NOT NULL,
	`source_page` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_approval_rules_code_uq` ON `material_approval_rules` (`rule_code`);--> statement-breakpoint
CREATE INDEX `material_approval_rules_category_idx` ON `material_approval_rules` (`category_code`);--> statement-breakpoint
CREATE TABLE `technical_material_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_code` text NOT NULL,
	`package_code` text NOT NULL,
	`system_code` text NOT NULL,
	`service_name` text NOT NULL,
	`medium_codes_json` text NOT NULL,
	`approval_rule_code` text,
	`required_grade` text NOT NULL,
	`required_finish` text NOT NULL,
	`fitting_standard` text NOT NULL,
	`valve_type` text NOT NULL,
	`flexible_tube_policy` text DEFAULT 'allowed' NOT NULL,
	`double_containment` integer DEFAULT false NOT NULL,
	`nominal_sizes_json` text DEFAULT '[]' NOT NULL,
	`restrictions` text DEFAULT '' NOT NULL,
	`source_document` text NOT NULL,
	`source_pages` text NOT NULL,
	`source_clause` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `technical_material_rules_code_uq` ON `technical_material_rules` (`rule_code`);--> statement-breakpoint
CREATE INDEX `technical_material_rules_system_idx` ON `technical_material_rules` (`system_code`);
--> statement-breakpoint
INSERT OR IGNORE INTO `material_approval_rules` (`id`,`rule_code`,`package_code`,`category_code`,`item_name`,`required_grade`,`allowed_brands_json`,`restrictions`,`source_document`,`source_page`,`status`) VALUES
('bar-a1','A-1','GAS-1','GAS','不锈钢管及配件 SUS316L VIM+VAR','SUS316L VIM+VAR','["SUMIKIN","NIPPONSTEEL&SUMITOMOMETAL","KUZE","Dockweiler"]','腐蚀性特殊气体使用；需提供材质证明与内表面报告','附件2：品牌报审表.pdf','1','approved'),
('bar-a2','A-2','GAS-1','GAS','不锈钢管及配件 SUS316L EP','SUS316L EP','["SUMIKIN","NIPPONSTEEL&SUMITOMOMETAL","KUZE","Dockweiler","NEWBEST"]','纯化/特殊气体使用；EP 粗糙度与氧化层需验证','附件2：品牌报审表.pdf','1-2','approved'),
('bar-a3','A-3','GAS-1','GAS','不锈钢管及配件 SUS316L BA','SUS316L BA','["SUMIKIN","NIPPONSTEEL&SUMITOMOMETAL","KUZE","Valex","Dockweiler","NEWBEST"]','大宗 GN2/N2-Gun 等系统使用','附件2：品牌报审表.pdf','1','approved'),
('bar-a4','A-4','GAS-1','GAS','不锈钢管及配件 SUS304 AP','SUS304 AP','["SUMIKIN","NIPPONSTEEL&SUMITOMOMETAL","KUZE","Valex","Dockweiler","Better puro","Nano-Pure","NEWBEST"]','Better puro/Nano-Pure 仅 PV/HV/SA/O2-S 使用','附件2：品牌报审表.pdf','1-2','approved'),
('bar-a5','A-5','GAS-1','GAS','机械配件 VCR / Swagelok','316L','["FUJIKIN","KITZ","SWAGELOK","JSK"]','必须具备原厂钢印或喷码','附件2：品牌报审表.pdf','2','approved'),
('bar-a6','A-6','GAS-1','GAS','PFA451HP 软管','PFA451HP','["YODOGAWA","NICHIAS","PILLAR","ENTEGRIS"]','仅允许在技术文件明确的临时软管场景使用','附件2：品牌报审表.pdf','2','approved'),
('bar-a7','A-7','GAS-1','GAS','隔膜阀 Diaphragm Valve','316L','["FUJIKIN","AP Tech","OHNO","KITZ","Parker"]','品牌变更必须重新报审','附件2：品牌报审表.pdf','2','approved'),
('bar-a8','A-8','GAS-1','GAS','波纹管阀 Bellow Valve','316L','["OHNO","CARTEN-Fujikin","FUJIKIN","KITZ"]','','附件2：品牌报审表.pdf','2','approved'),
('bar-a9','A-9','GAS-1','GAS','球阀 Ball Valve','316L','["OHNO","CARTEN-Fujikin","FUJIKIN","KITZ","Parker"]','','附件2：品牌报审表.pdf','2','approved'),
('bar-a10','A-10','GAS-1','GAS','压力表 Pressure Gauge','316L','["SETRA","WIKA","BROOKS","TEMTECH","NKS"]','','附件2：品牌报审表.pdf','2-3','approved'),
('bar-a11','A-11','GAS-1','GAS','调压阀 Pressure Regulator','316L','["AP Tech","Parker","TESCOM","SWAGELOK"]','CV 值需覆盖 HDC 最大流量与压力','附件2：品牌报审表.pdf','3','approved'),
('bar-a14','A-14','GAS-1','GAS','气体侦测器','Detector','["Honeywell","RIKEN","New Cosmos"]','传感器、过滤器和主系统通讯必须兼容','附件2：品牌报审表.pdf','3','approved'),
('bar-i1','I-1','GAS-1','HEAT','温控器','Controller','["ABZIL","OMRON","RKC"]','','附件2：品牌报审表.pdf','11','approved'),
('bar-i2','I-2','GAS-1','HEAT','PLC','PLC','["Mitsubishi","OMRON","西门子","施耐德","AB"]','需支持 RS485 转 TCP/IP 或 Ethernet','附件2：品牌报审表.pdf','11','approved'),
('bar-i3','I-3','GAS-1','HEAT','MCCB','MCCB','["ABB","施耐德","西门子","三菱","GE"]','断路器需满足 208V/40A/50A/75A/150A/3P/25kA 条件','附件2：品牌报审表.pdf','11','approved'),
('bar-j1','J-1','GAS-1','GDS','漏液检知系统','Leak Detection','["DOGOST","Honeywell","Yuminst"]','需与主系统架构相容','附件2：品牌报审表.pdf','11-12','approved');
--> statement-breakpoint
INSERT OR IGNORE INTO `technical_material_rules` (`id`,`rule_code`,`package_code`,`system_code`,`service_name`,`medium_codes_json`,`approval_rule_code`,`required_grade`,`required_finish`,`fitting_standard`,`valve_type`,`flexible_tube_policy`,`double_containment`,`nominal_sizes_json`,`restrictions`,`source_document`,`source_pages`,`source_clause`,`status`) VALUES
('tm-cda','GAS-CDA','GAS-1','GAS','Bulk gas / CDA','["CDA","CDA-Gun","PCDA","BA","Vent"]','A-4','304','AP','Swagelok','Ball valve + regulator/gauge','allowed',0,'["1/4”","3/8”","1/2”","3/4”","1”"]','CDA 等 Bulk gas 使用 SUS304 AP 5S；管配件与管路同规格','附件1：技术文件.pdf','4-7','2.3 / 2.4.1','active'),
('tm-gn2','GAS-GN2','GAS-1','GAS','Bulk gas / GN2','["GN2","G-N2","N2-Gun"]','A-3','316L','BA','Swagelok','Ball valve / diaphragm valve','allowed',0,'["1/4”","3/8”","1/2”","3/4”"]','GN2 使用 SUS316L BA 5S；N2-Gun 使用 BA 5S + ball valve','附件1：技术文件.pdf','4-7','2.3 / 2.4.4','active'),
('tm-purified','GAS-PURIFIED','GAS-1','GAS','Purified gas','["PN2","P-N2","PAr","P-Ar","PHe","P-He","PO2","P-O2","PH2"]','A-2','316L','EP','VCR','Diaphragm valve + regulator/gauge','allowed',0,'["1/4”","3/8”","1/2”","3/4”"]','Purified gas 采用 SUS316L EP(VOD) 5S；PH2 不配置调压阀与压力表','附件1：技术文件.pdf','4-7','2.3 / 2.4.5','active'),
('tm-sa','GAS-SA','GAS-1','GAS','Local scrubber SA','["SA"]','A-4','304','AP','Swagelok','Ball valve','allowed',0,'["3/4”"]','仅用于 ETCH/DIFF/IMP/CU local scrubber','附件1：技术文件.pdf','5-7','2.3 / 2.4.3','active'),
('tm-o2s','GAS-O2S','GAS-1','GAS','Local scrubber O2-S','["O2-S"]','A-4','304','AP','Swagelok','Ball valve','allowed',0,'["1/2”"]','仅用于 CVD/PVD local scrubber','附件1：技术文件.pdf','5-7','2.3 / 2.4.3','active'),
('tm-ng','GAS-NG','GAS-1','GAS','Natural gas','["NG","Natural gas"]','A-4','304','AP(ODMP)','Swagelok / VCR','None','allowed',0,'["1/4”","3/8”","1/2”","3/4”"]','仅用于 local scrubber；需按送审确定','附件1：技术文件.pdf','5-7','2.3 / 2.4.2','active'),
('tm-pv','GAS-PV','GAS-1','GAS','Process vacuum','["PV","HV"]','A-4','304','AP','Swagelok','Ball valve','allowed',0,'["1/4”","3/8”","1/2”","3/4”"]','PFA451HP 软管不超过 1/2”；可用 Swagelok 或 quick connector','附件1：技术文件.pdf','5-7','2.3 / 2.4.1','active'),
('tm-special-inert','GAS-SPECIAL-INERT','GAS-1','GAS','Special gas / inert','["SF6","CHF3","C4F8","C3F8","CO2","Kr","CF4"]','A-2','316L','EP','VCR','VCR male / bulkhead fitting','forbidden',0,'["1/4”","3/8”","1/2”"]','Hookup 侧禁止软管和附加组件；VCR male 在 gas box 内','附件1：技术文件.pdf','5-7','2.3 / 2.4.7','active'),
('tm-special-flammable','GAS-SPECIAL-FLAMMABLE','GAS-1','GAS','Special gas / flammable','["SiH2Cl2","NH3","C4F6","CH2F2","CH3F","CH4","C3H6","C2H4","5%H2/He2","10%CH4/Ar"]','A-2','316L','EP','VCR','VCR male / bulkhead fitting','forbidden',0,'["1/4”","3/8”","1/2”"]','必须采用 VCR lock 或 bulkhead fitting；禁止 Hookup 侧软管','附件1：技术文件.pdf','5-7','2.3 / 2.4.7','active'),
('tm-special-double','GAS-SPECIAL-DOUBLE','GAS-1','GAS','Special gas / double containment','["Si2H6","COS","CO","SiH4","1%PH3/N2","1%GeH4/H2","5%B2H6/N2"]','A-2','316L','EP','Butt weld','Double containment butt weld terminal','forbidden',1,'["3/8”","1/2”"]','内管 SUS316L EP(VOD)，外管 SUS304 AP；VMB 侧开口、气柜外闭合','附件1：技术文件.pdf','5-7','2.3 / 2.4.7','active'),
('tm-corrosive','GAS-CORROSIVE','GAS-1','GAS','Corrosive special gas','["WF6","HCl","HBr","BCl3","SiCl4","HF","SO2","SiF4","N2O","NO","NF3"]','A-1','316L','VIM+VAR','VCR','VCR male / bulkhead fitting','forbidden',0,'["1/4”","3/8”","1/2”"]','腐蚀性特殊气体采用 SUS316L VIM+VAR；Hookup 侧禁止软管','附件1：技术文件.pdf','6-7','2.3 / 2.4.8','active'),
('tm-corrosive-double','GAS-CORROSIVE-DOUBLE','GAS-1','GAS','Corrosive gas / double containment','["Cl2","20%F2/N2","ClF3"]','A-1','316L','VIM+VAR','Butt weld','Double containment butt weld terminal','forbidden',1,'["3/8”","1/2”"]','内管 SUS316L VIM+VAR，外管 SUS304 AP','附件1：技术文件.pdf','6-7','2.3 / 2.4.8','active');
--> statement-breakpoint
INSERT OR IGNORE INTO `materials` (`id`,`manufacturer`,`code`,`name`,`grade`,`base_material`,`surface_finish`,`cleanliness_grade`,`max_pressure_mpa`,`min_temperature_c`,`max_temperature_c`,`certifications_json`,`status`) VALUES
('mat-sumikin-316lep','SUMIKIN','GAS-SUMIKIN-316L-EP','SUMIKIN SUS316L EP 管材/管件','316L','SS','EP','UHP',8.3,-40,180,'["MTC 3.1","EP roughness ≤0.25um","Helium Leak Test"]','approved'),
('mat-kuze-316lep','KUZE','GAS-KUZE-316L-EP','KUZE SUS316L EP 管材/管件','316L','SS','EP','UHP',8.3,-40,180,'["MTC 3.1","EP surface report","Helium Leak Test"]','approved'),
('mat-dock-304ap','Dockweiler','GAS-DOCK-304-AP','Dockweiler SUS304 AP 5S 管材/管件','304','SS','AP','HP',10.0,-40,200,'["MTC 3.1","5S wall thickness","Passivation report"]','approved'),
('mat-sumikin-316lba','SUMIKIN','GAS-SUMIKIN-316L-BA','SUMIKIN SUS316L BA 5S 管材/管件','316L','SS','BA','HP',10.0,-40,200,'["MTC 3.1","BA surface report"]','approved'),
('mat-kuze-316lvar','KUZE','GAS-KUZE-316L-VAR','KUZE SUS316L VIM+VAR 管材/管件','316L','SS','VIM+VAR','UHP',10.0,-40,200,'["MTC 3.1","VIM+VAR report","Helium Leak Test"]','approved'),
('mat-newbest-304ap','NEWBEST','GAS-NEWBEST-304-AP','NEWBEST SUS304 AP 管材/管件','304','SS','AP','HP',10.0,-40,200,'["MTC 3.1","Surface report"]','approved');
