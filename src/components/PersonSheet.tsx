'use client';
import Link from 'next/link';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { MEMBERS } from '@/lib/sample/household';

export function PersonSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Whose insights?">
      <div className="list">
        <button type="button" className="row" onClick={onClose} aria-current="true">
          <span className="avatar av-you">You</span>
          <span className="grow"><b>You</b><span className="small">All your insights</span></span>
          <Icon name="check" role="img" aria-hidden={false} aria-label="Selected" style={{ width: 18, height: 18, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinecap: 'round' }} />
        </button>
        {(['sam', 'maya'] as const).map((k) => {
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
      <span className="tiny">Preview. You only see what each person has chosen to share.</span>
    </Sheet>
  );
}
