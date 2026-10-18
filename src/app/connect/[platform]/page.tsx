import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UploadScreen } from '@/components/screens/Upload';
import { UPLOAD_LABEL, UPLOAD_PLATFORMS, isUploadPlatform } from '@/lib/ui/platforms';

type Params = Promise<{ platform: string }>;

export function generateStaticParams() {
  return UPLOAD_PLATFORMS.map((platform) => ({ platform }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { platform } = await params;
  return { title: isUploadPlatform(platform) ? `Upload ${UPLOAD_LABEL[platform]}` : 'Upload' };
}

export default async function Page({ params }: { params: Params }) {
  const { platform } = await params;
  if (!isUploadPlatform(platform)) notFound();
  return <UploadScreen platform={platform} />;
}
