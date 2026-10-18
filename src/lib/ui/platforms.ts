// Platforms the user can upload an export for. Server-safe (no 'use client').
export const UPLOAD_PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const;
export type UploadPlatform = (typeof UPLOAD_PLATFORMS)[number];

export const UPLOAD_LABEL: Record<UploadPlatform, string> = {
  youtube: 'YouTube and Google Search',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export function isUploadPlatform(p: string): p is UploadPlatform {
  return (UPLOAD_PLATFORMS as readonly string[]).includes(p);
}
