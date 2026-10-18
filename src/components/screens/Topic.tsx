'use client';
import { useEffect, useId, useState } from 'react';
import { PageTitle, Screen } from '../Screen';
import { Icon } from '../Icon';
import { EmptyState, Loading } from '../bits';
import { useDrift } from '@/lib/pipeline/useDrift';
import type { Origin, Platform, TopicDetail, TopicSource } from '@/lib/types';
import { dateShort, monthLong, num, PLATFORM_LABEL } from '@/lib/ui/format';

const FEWER_TIP: Partial<Record<Platform, string>> = {
  youtube: 'On YouTube, tap the three dots next to one of these videos and choose Don’t recommend channel. Not interested works for single videos.',
  tiktok: 'On TikTok, press and hold one of these videos and tap Not interested. You can also filter keywords in Settings, Content preferences.',
  instagram: 'On Instagram, tap the three dots on one of these posts and choose Not interested.',
};

function unit(p: Platform, n: number) {
  if (p === 'google_search') return n === 1 ? 'search' : 'searches';
  if (p === 'instagram') return n === 1 ? 'post' : 'posts';
  return n === 1 ? 'video' : 'videos';
}

function sourceLine(s: TopicSource) {
  return `${PLATFORM_LABEL[s.platform]}, ${num(s.count)} ${unit(s.platform, s.count)}${s.subscribed ? ', subscribed' : ''}`;
}

function OriginTag({ origin }: { origin: Origin }) {
  const chosen = origin === 'chosen' || origin === 'engaged';
  const label = origin === 'pushed' ? 'Ad' : chosen ? 'Chosen' : 'Served';
  return <span className={`tag ${chosen ? 'tag-chosen' : origin === 'pushed' ? 'tag-amber' : 'tag-served'}`}>{label}</span>;
}

/** The platform that served the most of this topic, for "See fewer of these". */
function topServedPlatform(d: TopicDetail): Platform | undefined {
  const served = d.sources.filter((s) => s.origin === 'served' && FEWER_TIP[s.platform]);
  const byPlatform = new Map<Platform, number>();
  served.forEach((s) => byPlatform.set(s.platform, (byPlatform.get(s.platform) ?? 0) + s.count));
  return [...byPlatform.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function TopicScreen({ id }: { id: string }) {
  const { insights, status } = useDrift();
  const [showItems, setShowItems] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const itemsId = useId();
  const tipId = useId();
  const d = insights.topics[id];
  const label = d?.label;

  // Topics live only in the browser, so the server-rendered title is generic.
  useEffect(() => { if (label) document.title = `${label} · Drift`; }, [label]);

  if (status !== 'ready') {
    return <Screen tabbed back="/timeline"><PageTitle>Topic</PageTitle><Loading blocks={[96, 30, 168, 54]} /></Screen>;
  }
  if (!d) {
    return (
      <Screen tabbed back="/timeline">
        <PageTitle>Topic not found</PageTitle>
        <EmptyState title="Nothing to show" action={{ href: '/timeline', label: 'Back to the timeline' }}>
          This topic isn&rsquo;t in your current results. It may have been removed when your data changed.
        </EmptyState>
      </Screen>
    );
  }

  const platform = topServedPlatform(d);
  const sources = [...d.sources].sort((a, b) => b.count - a.count);
  const sameMonth = d.fromMonth === d.toMonth;

  return (
    <Screen tabbed back="/timeline">
      <PageTitle>{d.label}</PageTitle>
      {d.sensitive && (
        <span className="tiny lock-line"><Icon name="lock" />Only you can see this topic</span>
      )}
      <div className="grid2">
        <div className="card" style={{ gap: 4 }}>
          <span className="tiny">Share of viewing</span>
          <span className="stat">{Math.round(d.shareFrom)}% &rarr; {Math.round(d.shareTo)}%</span>
          <span className="tiny">{sameMonth ? monthLong(d.toMonth, true) : `${monthLong(d.fromMonth)} to ${monthLong(d.toMonth)}`}</span>
        </div>
        <div className="card" style={{ gap: 4 }}>
          <span className="tiny">Served to you</span>
          <span className="stat" style={{ color: 'var(--accent-t)' }}>{Math.round(d.servedPct)}%</span>
          <span className="tiny">not from your searches or follows</span>
        </div>
      </div>

      <h2>Where it came from</h2>
      {sources.length === 0 ? (
        <span className="small">No clear sources yet.</span>
      ) : (
        <div className="list">
          {sources.map((s, i) => (
            <div className="row" key={`${s.platform}-${s.name}-${i}`}>
              <span className="grow"><b style={{ fontSize: 15 }}>{s.name}</b><span className="tiny">{sourceLine(s)}</span></span>
              <span className={`tag ${s.origin === 'served' ? 'tag-served' : 'tag-chosen'}`}>{s.origin === 'served' ? 'Served' : 'Chosen'}</span>
            </div>
          ))}
        </div>
      )}

      {showItems && (
        <div className="list" id={itemsId}>
          {d.recentItems.length === 0 && <div className="row"><span className="small">No individual items saved for this topic.</span></div>}
          {d.recentItems.map((it, i) => {
            const title = it.title || (it.platform === 'tiktok' ? 'TikTok video (no title in export)' : 'Untitled');
            return (
              <div className="row" key={i}>
                <span className="grow">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontWeight: 700 }}>
                      {title}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <b style={{ fontSize: 15 }}>{title}</b>
                  )}
                  <span className="tiny">{PLATFORM_LABEL[it.platform]}, {dateShort(it.time)}</span>
                </span>
                <OriginTag origin={it.origin} />
              </div>
            );
          })}
        </div>
      )}

      {showTip && platform && (
        <div className="card note" id={tipId} role="status"><Icon name="info" /><span className="small t1">{FEWER_TIP[platform]}</span></div>
      )}

      <div className="bottom">
        {platform && (
          <button type="button" className="btn" aria-expanded={showTip} aria-controls={showTip ? tipId : undefined} onClick={() => setShowTip((v) => !v)}>
            See fewer of these on {PLATFORM_LABEL[platform]}
          </button>
        )}
        <button type="button" className="btn btn-2" aria-expanded={showItems} aria-controls={showItems ? itemsId : undefined} onClick={() => setShowItems((v) => !v)}>
          {showItems ? 'Hide the videos' : `Show the videos${d.itemCount ? ` (${num(d.itemCount)})` : ''}`}
        </button>
        {showItems && d.recentItems.length > 0 && d.itemCount > d.recentItems.length && (
          <span className="tiny" style={{ textAlign: 'center' }}>Showing the {d.recentItems.length} most recent of {num(d.itemCount)}.</span>
        )}
      </div>
    </Screen>
  );
}
