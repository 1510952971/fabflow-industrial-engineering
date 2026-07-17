# FabFlow 独立部署说明

本项目直接部署到 Cloudflare Workers，并使用 Cloudflare D1 与 R2。项目不依赖 Codex Sites，也不需要绑定 Codex 账号。

## 首次部署

1. 登录 Cloudflare：

   ```powershell
   npm run cloudflare:login
   ```

2. 创建生产资源：

   ```powershell
   npx wrangler d1 create fabflow-d1
   npx wrangler r2 bucket create fabflow-files
   ```

3. 将 D1 创建命令返回的 `database_id` 写入根目录 `wrangler.jsonc`，替换全零占位值。

4. 应用生产数据库迁移：

   ```powershell
   npm run db:migrate:remote
   ```

5. 配置生产密钥。集成入站接口至少应设置一个高强度随机值：

   ```powershell
   npx wrangler secret put INTEGRATION_API_KEY
   ```

   ERP、QMS、计划、设备厂、BMS、EPMS、SCADA 和电子签章的凭据继续使用 Wrangler Secret，不写入代码、D1 或浏览器。

6. 发布：

   ```powershell
   npm run deploy:cloudflare
   ```

Cloudflare 会返回独立的 `workers.dev` 地址。需要企业自有域名时，在 Cloudflare 控制台为 Worker 添加 Custom Domain，并按企业安全策略配置 Access、WAF、速率限制和日志保留。

## 本地运行

本地 D1 和 R2 使用 Wrangler 的项目内持久化目录，不需要 Cloudflare 登录：

```powershell
npm install
npm run db:migrate:local
npm run dev
```

`wrangler.jsonc` 中全零的 D1 ID 只用于尚未配置云资源时的本地开发；正式部署前必须替换成 Cloudflare 返回的真实 ID。
