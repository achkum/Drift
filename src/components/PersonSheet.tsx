'use client';
import Link from 'next/link';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { useHouseholdLive } from './HouseholdProvider';
import { MEMBERS } from '@/lib/sample/household';
import { CAT_WORD } from '@/lib/household/ask';
import { avatarFor } from '@/lib/ui/useHousehold';
import { joinAnd } from '@/lib/ui/format';

export function PersonSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const hh = useHouseholdLive();
  const real = hh.inHousehold && !hh.gone;
  const others = hh.members.filter((m) => !m.isMe && m.status === 'active');
  return (
    <Sheet open={open} onClose={onClose} title="Whose insights?">
      <div className="list">
        <button type="button" className="row" onClick={onClose} aria-current="true">
          <span className="avatar av-you">You</span>
          <span className="grow"><b>You</b><span className="small">All your insights</span></span>
          <Icon name="check" role="img" aria-hidden={false} aria-label="Selected" style={{ width: 18, height: 18, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinecap: 'round' }} />
        </button>
        {real ? others.map((m) => {
          const av = avatarFor(m);
          const cats = (hh.summaries[m.memberId]?.summary.categories ?? []).filter((c) => c !== 'sensitive' && c !== 'questions');
          const alerts = hh.alerts.filter((a) => a.about === m.memberId).length;
          return (
            <Link key={m.memberId} href={`/household/${encodeURIComponent(m.memberId)}`} className="row" onClick={onClose}>
              <span className={`avatar ${av.cls}`} aria-hidden="true">{av.initial}</span>
              <span className="grow">
                <b>{m.displayName}</b>
                <span className="small">{cats.length ? `Shares ${joinAnd(cats.map((c) => CAT_WORD[c]))}` : 'Hasn’t shared anything yet'}</span>
              </span>
              {alerts > 0 && <span className="tag tag-amber">{alerts} alert{alerts > 1 ? 's' : ''}</span>}
            </Link>
          );
        }) : (['sam', 'maya'] as const).map((k) => {
          const m = MEMBERS[k];
          return (
            <Link key={k} href={`/household/${k}`} className="row" onClick={onClose}>
              <span className={`avatar ${m.avatarClass}`} aria-hidden="true">{m.initial}</span>
              <span className="grow">
                <b>{m.displayName}</b>
                <span className="small">{k === 'sam' ? 'Shares interest drift and ads' : 'Weekly summary and alerts'}</span>
              </span>
              {m.alert && <span className="tag tag-amber">1 alert</span>}
            </Link>
          );
        })}
      </div>
      {real
        ? <span className="tiny">You only see what each person has chosen to share.{others.length === 0 ? ' Nobody else has joined yet.' : ''}</span>
        : <span className="tiny">Preview with sample people. <Link href="/household" className="link" onClick={onClose}>Create or join a household</Link> to see real people.</span>}
    </Sheet>
  );
}
