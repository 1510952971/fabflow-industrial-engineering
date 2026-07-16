# FabFlow 数据底座与设备厂协同

## 权威对象

`projects` → `systems` → `tags` / `interfaces`，工程对象再关联 `materials`、`purchase_orders`、`test_packs`、`punch_items`。设备厂协同使用 `equipment_factories`、`equipment_models`、`equipment_components`、`equipment_ports`；选型过程写入 `selection_runs` 与 `selection_results`。

## 服务端接口

- `GET /api/foundation/summary`：D1/R2 状态、对象数量、当前身份和待处理队列。
- `GET /api/equipment/catalog`：设备厂、型号、内部部件、设备口、批准材料。
- `POST /api/equipment/validate`：校验介质、材料等级、表面处理、洁净等级、压力、温度、连接制式、尺寸和材料证明，并落库审计。
- `GET/POST /api/files`：R2 文件上传与 D1 元数据登记，单文件上限 25MB。
- `GET/POST /api/approvals`：创建审批、批准或驳回，覆盖材料选型和 RFC 等对象。
- `POST /api/integrations/events`：ERP/QMS/计划/BMS/EPMS/SCADA 事件入口，要求 `x-fabflow-integration-key` 与 `Idempotency-Key`。

## RBAC

服务端按工作区身份读取 `oai-authenticated-user-email`，并在 D1 的 `users` / `user_roles` 中判断权限。首个工作区用户自动成为 `platform_admin`，后续用户默认为 `viewer`，再由管理员授予 `project_manager`、`system_owner`、`equipment_engineer` 或 `reviewer`。

## 设备选型判定

判定规则采用“任一致命不符合即禁止发布、仅警告则带条件通过、全部符合才通过”的工程逻辑。压力取材料与设备口额定值的最小值，温度取材料、介质兼容矩阵和设备口额定值的最小值；接口同时校验连接标准和公称尺寸。

## 集成落地顺序

1. 为 ERP/QMS/计划系统配置服务账号和 `INTEGRATION_API_KEY`。
2. 先接 `erp.po.upsert`、`qms.ncr.upsert`、`schedule.activity.upsert`，验证幂等和失败重试。
3. 再接 BMS/EPMS/SCADA 的报警、状态和能源快照；高频趋势建议落到时序数据库，D1 只保存事件索引和关键快照。
4. 生产环境启用 R2 生命周期、文件病毒扫描、审批电子签和审计归档策略。
