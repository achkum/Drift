// OWNER: MVP2 ads agent. Finds manipulative techniques in ad titles (fear, fake urgency, fake discounts, scams).
import type { AdTactic, ClassifiedEvent } from '@/lib/types';

/** Ads are events with origin 'pushed'. Returns tactics sorted by count, most first. */
export function detectAdTactics(events: ClassifiedEvent[]): AdTactic[] {
  void events;
  return [];
}
