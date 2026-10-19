'use client';
// The teen consent form (wireframe /teen): per-category switches and the "Always yours" box.
import { SwitchRow } from '../controls';
import type { ShareCategory } from '@/lib/household';

export type TeenFlags = Record<'trends' | 'sources' | 'ads' | 'questions' | 'alerts', boolean>;

export const TEEN_ROWS: { cat: keyof TeenFlags & ShareCategory; title: string; detail: string }[] = [
  { cat: 'trends', title: 'Topic trends', detail: 'Your main topics, month by month' },
  { cat: 'sources', title: 'Where topics come from', detail: 'Chosen vs served, and the channels behind topics' },
  { cat: 'ads', title: 'Ads and interest lists', detail: 'Who targets you, and what platforms think you like' },
  { cat: 'questions', title: 'Questions to Drift', detail: 'Your parent can ask Drift about your data. You see every question they ask.' },
  { cat: 'alerts', title: 'Safety alerts', detail: 'If your feed shifts sharply toward something harmful, you are told first. Your parent hears 2 days later, only if this is on.' },
];

export const NO_TEEN_FLAGS: TeenFlags = { trends: false, sources: false, ads: false, questions: false, alerts: false };

export function TeenConsentForm({ flags, onChange, parent = 'your parent' }: { flags: TeenFlags; onChange(f: TeenFlags): void; parent?: string }) {
  return (
    <>
      <div className="list">
        {TEEN_ROWS.map((r) => (
          <SwitchRow
            key={r.cat}
            small
            title={r.title}
            detail={r.detail.replace(/your parent/gi, (m) => (m[0] === 'Y' ? parent[0].toUpperCase() + parent.slice(1) : parent))}
            checked={flags[r.cat]}
            onChange={(v) => onChange({ ...flags, [r.cat]: v })}
          />
        ))}
      </div>
      <div className="outline" style={{ gap: 8 }}>
        <b style={{ fontSize: 15 }}>Always yours</b>
        <span className="small">Your messages, and individual videos and searches, are never shared. Sensitive topics stay hidden unless you turn them on in Settings. Safety alerts always come to you first.</span>
      </div>
    </>
  );
}
