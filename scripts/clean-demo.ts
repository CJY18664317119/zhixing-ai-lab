// 清空演示数据 (样本 / 模型 / 运行记录)。用法: pnpm exec tsx scripts/clean-demo.ts
import { getDb } from '../lib/db';
import { models, runs, samples } from '../db/schema';

async function main() {
  const db = getDb();
  await db.delete(runs);
  await db.delete(models);
  await db.delete(samples);
  console.log('已清空样本 / 模型 / 运行记录');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
