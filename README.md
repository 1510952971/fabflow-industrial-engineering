# FabFlow 厂务工程与设备材料选型系统

面向全球 FAB 建设、厂务系统设计、设备厂协同、材料校验、采购质量、施工测试与移交的全栈工程管理原型。

## 推荐工作流程

1. 创建项目并初始化项目级 RBAC、13 类 FAB 厂务系统和资料目录。
2. 上传项目技术规格书，确认系统自动提取的介质、压力、温度、尺寸、接口、材质、标准、品牌等条件。
3. 用项目条件匹配全局设备材料型录；没有合格产品时进入 RFQ、TQ、品牌报审和待复核型录闭环。
4. 对候选产品及设备内部部件执行材料、介质、压力、温度、接口、洁净度和证据文件联合校验。
5. 选入项目 BOM，完成选型冻结、设备内部 BOM 冻结和项目发布审批。

完整界面操作和异常处理见 [FabFlow 操作说明](docs/operation-manual.md)。

## 本地运行

环境要求：Node.js 22.13 或更高版本。

```powershell
npm install
npm run db:migrate:local
npm run dev
```

终端显示本地地址后在浏览器打开。默认使用 `http://localhost:3000`；如果 3000 端口已占用，开发服务器会自动使用 3001 等后续端口。

首次运行必须执行本地迁移，用于建立 D1 项目、系统、Tag、接口、设备材料、BOM、审批、附件元数据、工作流、审计和连接器表。后续迁移命令可重复执行，只会应用尚未执行的版本。

## 验证与构建

```powershell
npm test
npm run lint
npm run build
```

## 访问与权限

- 生产站点允许公开查看经过脱敏的演示项目。
- 匿名访问只有结构化演示数据读取权限，不能读取附件、审批、审计或集成控制台，也不能写入。
- 工作区身份登录后，服务端从身份请求头识别用户；第一个工作区用户作为初始化管理员，后续用户默认仅能查看演示项目。
- 项目管理员需要在“数据底座与协同 → 权限与审批”中授予项目角色。所有 API 都会再次检查项目范围，不能只靠前端按钮控制权限。
- 正式页面地址采用 `/projects/{projectId}/{module}`，刷新和分享链接不会丢失当前项目与模块。

## 数据与文件

- D1：项目、系统、Tag、接口、设备材料、BOM、订单、测试包、Punch、MOC、CWP、工作流、审批、版本和审计。
- R2：图纸、计算书、ITP、照片、签字记录与竣工资料；D1 保存文件版本、哈希、签署与关联对象。
- `drizzle/`：生产部署时随站点一起发布的数据库迁移。

## 企业系统接入

“数据底座与协同 → 数据接入”可以保存 ERP、计划、QMS、设备厂、BMS、EPMS 和 SCADA 的非敏感连接器配置。密钥必须放在部署环境绑定中，不能写入前端或 D1。

入站事件接口要求：

- `x-fabflow-integration-key`：与部署环境中的 `INTEGRATION_API_KEY` 一致。
- `Idempotency-Key`：每条外部事件的幂等键。
- 对应项目连接器必须已启用。

当前支持 ERP 订单、QMS 试验包与 Punch、计划里程碑、设备厂型号与内部部件，以及 BMS / EPMS / SCADA 运行事件。连接器支持自定义字段映射、真实健康检查、验证后启用、单次增量同步、游标、同步运行记录、幂等与死信；正式上线仍需企业 IT 提供真实地址、密钥绑定、字段字典、网络白名单和对账样例。

“数据底座与协同 → 电子签章”支持配置通用企业签章服务、真实连通性检查、R2 原件提交、HMAC 回调验证、签后 PDF 回存、SHA-256 和审计。具体生产契约和上线门禁见 [正式生产对接手册](docs/production-integration-runbook.md)。

生产底座完成后的产品迭代主线是设计与选型、接口匹配和系统工程规则校验；企业集成保持为支撑能力。

## 常用命令

- `npm run dev`：启动本地开发服务器。
- `npm run db:migrate:local`：初始化或升级本地 D1。
- `npm run db:generate`：数据库结构变更后生成迁移。
- `npm test`：执行构建与回归测试。
- `npm run build`：生成 Cloudflare Worker 发布产物。

## 换电脑下载与更新

首次下载：

```powershell
git clone https://github.com/1510952971/fabflow-industrial-engineering.git
cd fabflow-industrial-engineering
npm install
npm run db:migrate:local
npm run dev
```

已有副本更新：

```powershell
git pull
npm install
npm run db:migrate:local
```

源码仓库不保存本机 `.wrangler` 数据库、R2 文件、账号会话、产品型录原件、日志、缓存、环境变量和发布压缩包。换电脑后需要重新初始化本地数据库；需要迁移真实业务数据时，应单独备份 D1/R2 或使用正式 Cloudflare 环境，不能把运行数据库提交到 Git。

## 独立部署

项目不依赖 Codex Sites。Cloudflare Workers、D1、R2 的首次创建、密钥配置和发布步骤见 [独立部署说明](docs/cloudflare-deployment.md)。
