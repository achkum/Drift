import type { Metadata } from 'next';
import { TopicScreen } from '@/components/screens/Topic';

type Params = Promise<{ id: string }>;

// Topics come from data stored in the browser, so the id is resolved on the client.
export const metadata: Metadata = { title: 'Topic' };

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  let topic = id;
  try { topic = decodeURIComponent(id); } catch { /* keep raw */ }
  return <TopicScreen id={topic} />;
}
