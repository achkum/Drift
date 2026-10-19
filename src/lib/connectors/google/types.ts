// OWNER: sync agent. JSON shapes shared by the /api/google/* routes and the browser client.
// No runtime imports here: this file is used by both server and client code.

/** Data Portability resource groups Drift asks for. Each maps to scope `${SCOPE_PREFIX}${resource}`. */
export const GOOGLE_RESOURCES = ['myactivity.youtube', 'myactivity.search', 'youtube.subscriptions'] as const;
export type GoogleResource = (typeof GOOGLE_RESOURCES)[number];

/** Resource groups that accept start_time / end_time (Google: My Activity and Chrome history only). */
export const TIME_FILTER_RESOURCES: readonly GoogleResource[] = ['myactivity.youtube', 'myactivity.search'];

export const SCOPE_PREFIX = 'https://www.googleapis.com/auth/dataportability.';

export type GoogleAccessType = 'one-time' | 'time-based' | 'unknown';

/** GET /api/google/status */
export interface GoogleStatusResponse {
  /** Server has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and DRIFT_TOKEN_KEY (or runs in mock mode). */
  configured: boolean;
  connected: boolean;
  /** True when DRIFT_GOOGLE_MOCK=1: no real Google calls are made. */
  mock?: boolean;
  accessType?: GoogleAccessType;
  /** When time-based access ends (from refresh_token_expires_in at consent time). */
  expiresAt?: string;
  /** Resource groups the user actually granted (they can untick scopes on the consent screen). */
  resources?: GoogleResource[];
  connectedAt?: string;
  /** Last time this browser started an export through the server. */
  lastExportAt?: string;
}

/** POST /api/google/export request body. */
export interface GoogleExportRequest {
  /** ISO time. When set, My Activity is exported from this time on (incremental sync). */
  since?: string;
}

/** POST /api/google/export 200 response. */
export interface GoogleExportResponse {
  /** Opaque id for GET /api/google/export/[jobId]. May bundle several Google archive jobs. */
  jobId: string;
  accessType: GoogleAccessType;
  resources: GoogleResource[];
  startTime?: string;
  /** Non-fatal problems, e.g. subscriptions were already exported in the last 24 h. */
  warnings: string[];
}

export type GoogleJobState = 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'CANCELLED';

/** GET /api/google/export/[jobId] */
export interface GoogleJobStateResponse {
  state: GoogleJobState;
  /** Signed download URLs (Cloud Storage, valid ~6 h). Present when state === 'COMPLETE'. */
  urls: string[];
  /** Start of the exported range (only when a time filter was used). */
  startTime?: string;
  /** End of the exported range. Use it as `since` for the next incremental export. */
  exportTime?: string;
  jobs: { id: string; state: GoogleJobState; urls: string[] }[];
  warnings: string[];
}

/** Every error response from /api/google/* has this shape. */
export interface GoogleErrorResponse {
  error: GoogleErrorCode;
  message: string;
  configured?: boolean;
  /** Seconds until a retry can succeed, when known. */
  retryAfter?: number;
}

export type GoogleErrorCode =
  | 'not_configured'
  | 'not_connected'
  | 'reauth_required'
  | 'already_exported'
  | 'rate_limited'
  | 'permission_denied'
  | 'invalid_request'
  | 'forbidden'
  | 'not_found'
  | 'upstream_error';
