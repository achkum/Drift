// OWNER: household agent. Household mailbox API. See docs/HOUSEHOLD.md.
// Receives only signed requests carrying public keys and end-to-end encrypted envelopes.
// Never receives viewing history.
import { getHouseholdHandler } from '@/lib/household/server/instance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: Request): Promise<Response> {
  const handler = await getHouseholdHandler();
  return handler(req);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
