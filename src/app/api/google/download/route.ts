// OWNER: sync agent. Thin wrapper; logic lives in src/lib/server/google.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleDownload } from '@/lib/server/google/download';

export async function GET(req: Request) {
  return handleDownload(req);
}
