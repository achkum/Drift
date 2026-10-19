// OWNER: sync agent. Thin wrapper; logic lives in src/lib/server/google.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleStatus } from '@/lib/server/google/handlers';

export async function GET(req: Request) {
  return handleStatus(req);
}
