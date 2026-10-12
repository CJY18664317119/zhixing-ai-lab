import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { models } from '@/db/schema';

export async function GET() {
  const rows = await getDb().select().from(models).orderBy(desc(models.id));
  return Response.json(rows.map((r) => ({ ...r, classes: JSON.parse(r.classes), metrics: JSON.parse(r.metrics) })));
}

/** 保存一次真实训练的结果 (质心 + 留出集指标)。训练本身在浏览器里跑, 这里只负责落库。 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const model = body?.model;
  if (!model?.centroids?.length || !Array.isArray(model.classes)) {
    return Response.json({ error: '模型数据不完整' }, { status: 400 });
  }
  const payload = JSON.stringify({ kind: model.kind, classes: model.classes, dims: model.dims, centroids: model.centroids });
  if (payload.length > 4_000_000) return Response.json({ error: '模型体积过大' }, { status: 400 });
  const [row] = await getDb()
    .insert(models)
    .values({
      task: model.task === 'detection' ? 'detection' : 'classification',
      classes: JSON.stringify(model.classes),
      payload,
      accuracy: String(model.metrics?.accuracy ?? 0),
      trainCount: Number(model.metrics?.trainCount ?? 0),
      valCount: Number(model.metrics?.valCount ?? 0),
      metrics: JSON.stringify(model.metrics ?? {}),
    })
    .returning({ id: models.id, createdAt: models.createdAt });
  return Response.json({ ...row, accuracy: model.metrics?.accuracy ?? 0, valCount: model.metrics?.valCount ?? 0, trainCount: model.metrics?.trainCount ?? 0, classes: model.classes });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return Response.json({ error: '缺少参数' }, { status: 400 });
  await getDb().delete(models).where(eq(models.id, id));
  return Response.json({ ok: true });
}
