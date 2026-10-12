import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { samples } from '@/db/schema';

const MAX_IMAGES = 200;

export async function GET() {
  const rows = await getDb().select().from(samples).orderBy(desc(samples.id));
  return Response.json(rows);
}

/** 新增样本: 图片以 data URL 存库, 限制单张 2 MB、总数 200 张。 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const items: { name?: string; dataUrl?: string; label?: string; task?: string }[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return Response.json({ error: '没有可保存的图片' }, { status: 400 });
  const db = getDb();
  const existing = await db.select({ id: samples.id }).from(samples);
  if (existing.length + items.length > MAX_IMAGES) {
    return Response.json({ error: `样本上限 ${MAX_IMAGES} 张, 请先删除部分图片` }, { status: 400 });
  }
  const rows = items
    .filter((i) => typeof i.dataUrl === 'string' && i.dataUrl.startsWith('data:image/'))
    .map((i) => ({
      name: String(i.name || '未命名').slice(0, 60),
      label: String(i.label || '').slice(0, 30),
      task: i.task === 'detection' ? 'detection' : 'classification',
      dataUrl: i.dataUrl as string,
    }))
    .filter((i) => i.dataUrl.length < 2_800_000);
  if (!rows.length) return Response.json({ error: '图片格式不支持或超过 2 MB' }, { status: 400 });
  const saved = await db.insert(samples).values(rows).returning({ id: samples.id, name: samples.name, label: samples.label });
  return Response.json(saved);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('all') === '1') {
    await getDb().delete(samples);
    return Response.json({ ok: true });
  }
  return Response.json({ error: '缺少参数' }, { status: 400 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return Response.json({ error: '缺少样本 id' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body.label === 'string') patch.label = body.label.slice(0, 30);
  if (Array.isArray(body.boxes)) patch.boxes = JSON.stringify(body.boxes);
  if (!Object.keys(patch).length) return Response.json({ error: '没有可更新的字段' }, { status: 400 });
  const [row] = await getDb().update(samples).set(patch).where(eq(samples.id, id)).returning();
  if (!row) return Response.json({ error: '样本不存在' }, { status: 404 });
  return Response.json(row);
}
