// 应用的表结构 (drizzle-orm pg-core)。
// 纪律 (由编译 lint 与发布预检强制):
//   - 只在这里声明表, 业务代码经 lib/db.ts 的 await getDb() 读写;
//   - 改动后两步走, 缺一不可: `pnpm run db:generate` 产出 drizzle/ 版本化迁移
//     并一起提交, 紧接着 `pnpm run db:migrate` 把它应用到开发库;
//   - 禁止手写 CREATE/ALTER SQL 与 IF NOT EXISTS 幂等技巧;
//   - 删表/删列和加表/加列不要放进同一次 generate, 先删再加。
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 键值配置: 目前只用来存类别名称 (labels)
export const appMeta = pgTable('app_meta', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 一张图片 = 一条样本; 图片以 data URL 存放, 前端直接渲染
export const samples = pgTable('samples', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().default(''),
  label: text('label').notNull().default(''),
  task: text('task').notNull().default('classification'), // classification | detection
  dataUrl: text('data_url').notNull(),
  boxes: text('boxes').notNull().default('[]'), // [{label,x,y,w,h}] 归一化坐标
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 训练产物: 质心模型 + 真实留出集指标
export const models = pgTable('models', {
  id: serial('id').primaryKey(),
  task: text('task').notNull().default('classification'),
  classes: text('classes').notNull().default('[]'),
  payload: text('payload').notNull(), // 质心向量
  accuracy: text('accuracy').notNull().default('0'),
  trainCount: integer('train_count').notNull().default(0),
  valCount: integer('val_count').notNull().default(0),
  metrics: text('metrics').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 运行记录: 每次识别结果都落库, 供输出面板与导出
export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  modelId: integer('model_id'),
  source: text('source').notNull().default('image'), // image | camera
  label: text('label').notNull().default(''),
  confidence: text('confidence').notNull().default('0'),
  command: text('command').notNull().default(''),
  boxes: text('boxes').notNull().default('[]'),
  detail: text('detail').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
