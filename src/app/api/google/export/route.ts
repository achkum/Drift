// OWNER: sync agent. Thin wrapper; logic lives in src/lib/server/google.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleExport } from '@/lib/server/google/handlers';

export async function POST(req: Request) {
  return handleExport(req);
}
