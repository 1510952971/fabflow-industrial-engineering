import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/workflow-schema.ts"],
  dialect: "sqlite",
});
