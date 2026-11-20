'use client';

import { Analytics } from '@vercel/analytics/next';
import type { BeforeSendEvent } from '@vercel/analytics';
import { redactAnalyticsUrl } from '@/lib/ui/analyticsUrl';

/**
 * Anonymous page-view counts (Vercel Web Analytics, no cookies).
 * URLs are redacted first so a page view never reveals a topic, a household member or an invite.
 */
export function WebAnalytics() {
  return <Analytics beforeSend={(event: BeforeSendEvent) => ({ ...event, url: redactAnalyticsUrl(event.url) })} />;
}
