// OWNER: sync agent. Thin wrapper; logic lives in src/lib/server/google.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleJobState } from '@/lib/server/google/handlers';

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  return handleJobState(req, jobId);
}
