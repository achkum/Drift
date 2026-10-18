// OWNER: parsers agent. Exact manual export steps per platform.
import type { ExportGuide } from '@/lib/types';

export const exportGuides: Record<ExportGuide['platform'], ExportGuide> = {
  youtube: { platform: 'youtube', title: 'Get your YouTube data', intro: '', steps: [], waitTime: '', uploadHint: '', notes: [] },
  tiktok: { platform: 'tiktok', title: 'Get your TikTok data', intro: '', steps: [], waitTime: '', uploadHint: '', notes: [] },
  instagram: { platform: 'instagram', title: 'Get your Instagram data', intro: '', steps: [], waitTime: '', uploadHint: '', notes: [] },
};
