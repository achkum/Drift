'use client';
import Link from 'next/link';
import { PageTitle, PreviewTag, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { useHousehold, useHouseholdLive } from '../HouseholdProvider';
import { LiveHouseholdScreen } from './HouseholdLive';
import { MEMBERS, VIEWER_NAMES, type ShareFlagsWithSensitive, type Viewer } from '@/lib/sample/household';
import { joinAnd } from '@/lib/ui/format';

const CAT_WORD: Record<keyof ShareFlagsWithSensitive, string> = {
  trends: 'trends', sources: 'sources', ads: 'ads', ai: 'questions', sens: 'sensitive topics',
};

export function shareSummary(share: Record<Viewer, ShareFlagsWithSensitive>): string {
  return (Object.keys(share) as Viewer[])
    .map((v) => {
      const on = (Object.keys(CAT_WORD) as (keyof ShareFlagsWithSensitive)[]).filter((k) => share[v][k]).map((k) => CAT_WORD[k]);
      return `With ${VIEWER_NAMES[v]}: ${on.length ? joinAnd(on) : 'nothing'}.`;
    })
    .join(' ');
}

/** Real household, or the sample people under ?preview=1. */
export function HouseholdScreen({ preview = false }: { preview?: boolean }) {
  const hh = useHouseholdLive();
  if (preview) return <SampleHouseholdScreen inHousehold={hh.inHousehold} />;
  return <LiveHouseholdScreen />;
}

/** Adds ?preview=1 so sample screens keep linking to sample screens. */
export function pv(href: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}preview=1`;
}

function SampleHouseholdScreen({ inHousehold }: { inHousehold: boolean }) {
  const { share } = useHousehold();
  return (
    <Screen tabbed back="/household">
      <PageTitle>Household</PageTitle>
      <p className="small lead"><PreviewTag />Sample people. 3 of 6 members. Everyone sees only what others choose to share.</p>
      <Link href="/household" className="banner">
        <Icon name="info" />
        <span>{inHousehold ? 'Sample people. Back to your real household.' : 'Sample people. Create or join a household to use your own.'}</span>
        <Icon name="chev" style={{ width: 16, height: 16 }} />
      </Link>
      <div className="list">
        <Link href="/home" className="row">
          <span className="avatar av-you" aria-hidden="true">You</span>
          <span className="grow"><b>You</b><span className="small">Owner, all your insights</span></span>
          <Chev />
        </Link>
        <Link href="/household/sam" className="row">
          <span className={`avatar ${MEMBERS.sam.avatarClass}`} aria-hidden="true">{MEMBERS.sam.initial}</span>
          <span className="grow"><b>Sam</b><span className="small">Partner, shares interest drift and ads</span></span>
          <Chev />
        </Link>
        <Link href="/household/maya" className="row">
          <span className={`avatar ${MEMBERS.maya.avatarClass}`} aria-hidden="true">{MEMBERS.maya.initial}</span>
          <span className="grow"><b>{MEMBERS.maya.displayName}</b><span className="small">Teen, weekly summary and alerts</span></span>
          <span className="tag tag-amber">1 alert</span>
        </Link>
        <div className="row">
          <span className="avatar av-leo" aria-hidden="true">L</span>
          <span className="grow"><b>Leo, 13</b><span className="small">Invited, waiting for Leo to accept</span></span>
        </div>
      </div>
      <Link href={pv('/invite')} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <span className="avatar" style={{ background: 'var(--bg)' }}>
          <Icon name="plus" style={{ width: 20, height: 20, fill: 'none', stroke: 'var(--t1)', strokeWidth: 2, strokeLinecap: 'round' }} />
        </span>
        <b style={{ fontSize: 16 }}>Invite someone</b>
      </Link>
      <Link href={pv('/sharing')} className="outline" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <span><b className="b16">What you share</b><span className="small">{shareSummary(share)}</span></span>
        <Chev />
      </Link>
      <Link href={pv('/household/compare')} className="outline" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <span><b className="b16">Household compared</b><span className="small">You, Sam and Maya next to other people</span></span>
        <Chev />
      </Link>
      <Link href={pv('/ask?about=household')} className="btn"><Icon name="sparkleOne" />Ask Drift about your household</Link>
    </Screen>
  );
}
