import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { samples } from '@/db/schema';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await getDb().delete(samples).where(eq(samples.id, Number(id)));
  return Response.json({ ok: true });
}
