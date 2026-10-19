// OWNER: sync agent. Thin wrapper; logic lives in src/lib/server/google.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleAuthCallback } from '@/lib/server/google/handlers';

export async function GET(req: Request) {
  return handleAuthCallback(req);
}
