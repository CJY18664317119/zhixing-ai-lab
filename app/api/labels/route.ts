import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { appMeta } from '@/db/schema';

const DEFAULT_LABELS = ['直行', '左转', '右转', '停止', '障碍物'];

async function readLabels(): Promise<string[]> {
  const [row] = await getDb().select().from(appMeta).where(eq(appMeta.key, 'labels'));
  if (!row?.value) return DEFAULT_LABELS;
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LABELS;
  } catch {
    return DEFAULT_LABELS;
  }
}

export async function GET() {
  return Response.json({ labels: await readLabels() });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const labels = (Array.isArray(body?.labels) ? body.labels : [])
    .map((l: unknown) => String(l).trim().slice(0, 30))
    .filter((l: string) => l.length > 0)
    .slice(0, 20);
  if (labels.length < 2) return Response.json({ error: '至少保留 2 个类别' }, { status: 400 });
  const db = getDb();
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'labels'));
  if (row) await db.update(appMeta).set({ value: JSON.stringify(labels) }).where(eq(appMeta.key, 'labels'));
  else await db.insert(appMeta).values({ key: 'labels', value: JSON.stringify(labels) });
  return Response.json({ labels });
}
