// OWNER: household agent. Public entry for household mode (MVP 4). Client-side only;
// server code lives in ./server and is never imported from here.
//
// SSR-safe: importing this module does nothing. Functions open IndexedDB on
// first call; getMe() returns null where storage is unavailable, the rest
// throw HouseholdError('unavailable').
// Reference: docs/HOUSEHOLD.md.
import type { Insights } from '@/lib/types';
import { createHouseholdClient, type HouseholdClient, type HouseholdClientOptions } from './client';
import type { InviteRole, ShareCategory } from './types';

export * from './types';
export { createHouseholdClient, defaultShareSettings, HouseholdError, MAX_QUESTION_LENGTH } from './client';
export type { HouseholdClient, HouseholdClientOptions } from './client';
export { buildSharedSummary, shareableAlerts, isSensitiveTopic, categoriesFromSettings, ALERT_SHARE_DELAY_MS } from './summary';
export { detectSafetyAlerts, SAFETY_THRESHOLDS, WATCHED_TOPICS } from './safety';
export { parseInviteFragment, INVITE_TTL_MS, JOIN_PATH } from './invite';

let defaultClient: HouseholdClient | null = null;

/** Replaces the default client's options (tests, custom mailbox URL). */
export function configureHousehold(opts: HouseholdClientOptions): void {
  defaultClient = createHouseholdClient(opts);
}

function c(): HouseholdClient {
  return (defaultClient ??= createHouseholdClient());
}

export const getMe = () => c().getMe();
export const setDisplayName = (name: string) => c().setDisplayName(name);
export const createHousehold = (name: string, displayName?: string) => c().createHousehold(name, displayName);
export const createInvite = (role: InviteRole, opts?: { label?: string; origin?: string }) => c().createInvite(role, opts);
export const cancelInvite = (inviteId: string) => c().cancelInvite(inviteId);
export const joinWithInvite = (
  fragment: string, displayName: string, role: InviteRole,
  opts?: { consent?: boolean; share?: Partial<Record<ShareCategory, boolean>> },
) => c().joinWithInvite(fragment, displayName, role, opts);
export const listMembers = () => c().listMembers();
export const getShareSettings = (memberId: string) => c().getShareSettings(memberId);
export const setShareSettings = (memberId: string, patch: Partial<Record<ShareCategory, boolean>>, insights?: Insights | null) =>
  c().setShareSettings(memberId, patch, insights);
export const publishSummaries = (insights?: Insights | null) => c().publishSummaries(insights);
export const fetchMemberSummaries = () => c().fetchMemberSummaries();
export const previewWhatTheySee = (memberId: string, insights?: Insights | null) => c().previewWhatTheySee(memberId, insights);
export const listQuestionsAboutMe = () => c().listQuestionsAboutMe();
export const logQuestion = (memberId: string, question: string, categories: ShareCategory[]) => c().logQuestion(memberId, question, categories);
export const getSafetyAlerts = (insights?: Insights | null) => c().getSafetyAlerts(insights);
export const dismissSafetyAlert = (alertId: string) => c().dismissSafetyAlert(alertId);
export const removeMember = (memberId: string) => c().removeMember(memberId);
export const leaveHousehold = () => c().leaveHousehold();
export const deleteHouseholdData = () => c().deleteHouseholdData();
