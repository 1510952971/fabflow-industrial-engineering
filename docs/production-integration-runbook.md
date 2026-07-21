# Facility Construction Management Software 正式生产对接手册

## 1. 企业需提供的输入

每个 ERP、QMS、计划系统、设备厂、BMS、EPMS、SCADA 连接器分别提供：

- 生产和测试 API 地址、健康检查路径、HTTPS 证书要求；
- 认证方式，以及由部署管理员创建的密钥绑定名（只交付引用名，不在 D1 保存密钥值）；
- 上游外部主键、增量游标、分页和删除语义；
- 字段字典、枚举、单位、时区、空值规则和一组脱敏样例；
- 入站 Webhook 的固定公网 IP 或 CIDR，以及双方网络白名单申请记录；
- 超时、限流、重试、补数、对账、维护窗口和故障联系人。

配置完成后的固定顺序是：保存配置 → 部署密钥 → 真实连接检查 → 启用 → 首次小批量同步 → 对账 → 放开正式调度。未通过检查的连接器不能启用。

## 2. 拉取接口契约

Facility Construction Management Software 对上游执行 HTTPS GET，请求自动携带配置的游标和 `limit=500`。典型响应：

```json
{
  "items": [
    { "id": "PO-10001", "orderNo": "450001", "vendorName": "供应商 A" }
  ],
  "nextCursor": "2026-07-17T10:00:00Z"
}
```

字段映射由连接器配置保存，例如：

```json
{
  "eventType": "erp.po.upsert",
  "itemsPath": "data.items",
  "nextCursorPath": "data.nextCursor",
  "cursorParam": "updatedAfter",
  "externalIdPath": "id",
  "fields": {
    "poNumber": "orderNo",
    "supplier": "vendorName",
    "packageCode": "packageCode",
    "amountCny": "totalAmount",
    "promisedDate": "deliveryDate",
    "status": "status"
  }
}
```

同一外部记录使用“连接器 + 事件类型 + 外部主键”生成幂等键。单条失败进入死信事件；批次有任一失败时不推进批次游标，避免静默丢数。

## 3. Webhook 契约

请求地址为 `/api/integrations/events`，必须携带：

- `x-fabflow-integration-key`：对应部署绑定 `INTEGRATION_API_KEY`；
- `Idempotency-Key`：来源系统生成的稳定幂等键；
- `Content-Type: application/json`。

项目连接器启用后才接收事件；配置来源 IP/CIDR 白名单时，服务端同时校验 `CF-Connecting-IP`。

## 4. 电子签章通用适配器

签章服务需提供一个 HTTPS 信封提交 API，接受 `multipart/form-data`：

- `file`：R2 中的待签原件；
- `title`：签章任务标题；
- `signers`：按顺序排列的签署人 JSON；
- `clientEnvelopeId`：Facility Construction Management Software 信封主键；
- `callbackUrl`：状态回调地址。

提交响应需返回 `{ "id": "外部信封号", "status": "submitted" }`。回调 JSON 至少包含 `externalEnvelopeId` 和 `status`；完成时必须包含与签章服务同源的 HTTPS `signedFileUrl`。回调头 `x-fabflow-signature` 为原始 JSON 正文的 HMAC-SHA256。签后 PDF 会写回 R2，D1 保存新附件版本、SHA-256、签署状态和审计记录。

若使用 Adobe Acrobat Sign、DocuSign 或境内电子合同平台，应在通用契约前增加供应商适配网关，不应把供应商私有协议直接散落在 Facility Construction Management Software 页面代码中。

## 5. 上线门禁

- 测试环境完成不少于一轮全量和三轮增量对账；
- 记录数、金额、状态、单位和枚举逐项核对；
- 重复推送、超时、401、429、500、断网和回放场景通过；
- 密钥轮换、最小权限、白名单、日志脱敏和离职回收通过安全评审；
- 签章证据下载、哈希、回调重放和失败补偿通过法务/质量确认；
- 生产调度启用前由项目管理员和企业 IT 双方签字放行。

## 6. 后续产品主线

生产对接属于支撑底座。完成企业配置后，功能迭代优先投入：设计输入完整性、设备内部材料选型、介质兼容性、接口尺寸/等级/标准匹配、系统边界和容量校核、联锁与 Cause & Effect 校验、规则偏差闭环及计算书证据生成。
