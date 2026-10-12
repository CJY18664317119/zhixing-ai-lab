import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { runs } from '@/db/schema';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('format') === 'csv') {
    const rows = await getDb().select().from(runs).orderBy(desc(runs.id)).limit(500);
    const csv = ['时间,来源,识别结果,置信度,输出指令', ...rows.map((r) => [new Date(r.createdAt).toISOString(), r.source, r.label, r.confidence, r.command].join(','))].join('\n');
    return new Response('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="run-results.csv"' } });
  }
  const rows = await getDb().select().from(runs).orderBy(desc(runs.id)).limit(100);
  return Response.json(rows.map((r) => ({ ...r, boxes: JSON.parse(r.boxes) })));
}

/** 记录一次识别输出 (图片或摄像头), 供输出面板与导出使用。 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const [row] = await getDb()
    .insert(runs)
    .values({
      modelId: body?.modelId ? Number(body.modelId) : null,
      source: body?.source === 'camera' ? 'camera' : 'image',
      label: String(body?.label ?? '').slice(0, 40),
      confidence: String(body?.confidence ?? 0).slice(0, 12),
      command: String(body?.command ?? '').slice(0, 40),
      boxes: JSON.stringify(Array.isArray(body?.boxes) ? body.boxes : []),
      detail: String(body?.detail ?? '').slice(0, 200),
    })
    .returning();
  return Response.json(row);
}

export async function DELETE() {
  await getDb().delete(runs).where(eq(runs.id, -1));
  return Response.json({ ok: true });
}
