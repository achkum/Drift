'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { PageTitle, Screen } from '../Screen';
import { Icon } from '../Icon';
import { EmptyState, ExternalRow, Loading, SampleBanner } from '../bits';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { useDrift } from '@/lib/pipeline/useDrift';
import type { AdTactic, AdvertiserRecord, Platform } from '@/lib/types';
import { AD_ACTIONS, erasureRequest, tacticExplanation } from '@/lib/ui/actions';
import { joinAnd, num, PLATFORM_LABEL, plural } from '@/lib/ui/format';

const SHOW_FIRST = 8;

/** Same advertiser on several platforms becomes one row. */
function mergeAdvertisers(list: AdvertiserRecord[]) {
  const map = new Map<string, { name: string; platforms: Platform[]; count?: number }>();
  for (const a of list) {
    const key = a.name.trim().toLowerCase();
    if (!key) continue;
    const cur = map.get(key) ?? { name: a.name.trim(), platforms: [] };
    if (!cur.platforms.includes(a.platform)) cur.platforms.push(a.platform);
    if (typeof a.count === 'number') cur.count = (cur.count ?? 0) + a.count;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name));
}

function TacticCard({ t }: { t: AdTactic }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="card" style={{ gap: 8 }}>
      <span className="split"><b className="b16">{t.label}</b><span className="count">{plural(t.count, 'ad')}</span></span>
      <span className="small">{tacticExplanation(t)}</span>
      {t.examples.length > 0 && (
        <>
          <button type="button" className="disclosure" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide examples' : `Show ${t.examples.length === 1 ? 'an example' : `${t.examples.length} examples`}`}
            <Icon name="down" />
          </button>
          <ul className="examples" id={listId} hidden={!open} aria-label={`Examples of ${t.label}`}>
            {t.examples.map((ex, i) => <li key={i}>&ldquo;{ex}&rdquo;</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function RequestSheet({ open, onClose, advertisers }: { open: boolean; onClose(): void; advertisers: string[] }) {
  const toast = useToast();
  const [company, setCompany] = useState('');
  const [other, setOther] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const selectId = useId();
  const otherId = useId();
  const textId = useId();
  const name = company === '__other' ? other : company;
  const text = useMemo(() => erasureRequest(name), [name]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it into an email to the company’s privacy contact.');
    } catch {
      // Clipboard blocked: select the text so the user can copy it themselves.
      textRef.current?.focus();
      textRef.current?.select();
      toast('Select all and copy the text above.');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ask an advertiser to delete your data">
      <p className="small">
        Under GDPR Article 17 you can ask any company to erase the data it holds about you. Drift doesn&rsquo;t send anything:
        copy this letter, fill in the brackets, and email it to the company&rsquo;s privacy or data protection contact (usually in its privacy policy).
      </p>
      <label className="field" htmlFor={selectId}>
        Company
        <select id={selectId} value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">Choose an advertiser</option>
          {advertisers.map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="__other">Another company</option>
        </select>
      </label>
      {company === '__other' && (
        <label className="field" htmlFor={otherId}>
          Company name
          <input id={otherId} type="text" value={other} onChange={(e) => setOther(e.target.value)} autoComplete="organization" />
        </label>
      )}
      <label className="field" htmlFor={textId}>
        Your request
        <textarea id={textId} ref={textRef} className="tmpl" readOnly value={text} rows={12} />
      </label>
      <button type="button" className="btn" onClick={copy}>Copy the request</button>
      <button type="button" className="btn btn-2" onClick={onClose}>Close</button>
    </Sheet>
  );
}

export function AdsScreen() {
  const { insights, isSample, status } = useDrift();
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState(false);
  const listId = useId();
  const ads = insights.ads;
  const advertisers = useMemo(() => mergeAdvertisers(ads.advertisers), [ads.advertisers]);
  const imported = new Set(insights.platforms.map((p) => p.platform));
  const actions = [...AD_ACTIONS].sort((a, b) => Number(b.platforms.some((p) => imported.has(p))) - Number(a.platforms.some((p) => imported.has(p))));
  const shown = showAll ? advertisers : advertisers.slice(0, SHOW_FIRST);
  const tacticAds = ads.tactics.reduce((s, t) => s + t.count, 0);

  if (status !== 'ready') {
    return <Screen tabbed back="/home"><PageTitle>Who targets you</PageTitle><Loading blocks={[20, 168, 120, 200]} /></Screen>;
  }

  const summary = advertisers.length || ads.adItems
    ? [
        ads.adItems ? `${plural(ads.adItems, 'ad')} in your exports` : null,
        advertisers.length ? `${plural(advertisers.length, 'advertiser')} named` : null,
      ].filter(Boolean).join(', ') + '.'
    : 'Your exports don’t list any ads or advertisers yet.';

  return (
    <Screen tabbed back="/home">
      <PageTitle>Who targets you</PageTitle>
      <span className="sub lead">{summary}</span>
      {isSample && <SampleBanner />}

      <h2>Advertisers</h2>
      {advertisers.length === 0 ? (
        <EmptyState title="No advertisers found">
          Instagram exports list advertisers who used your activity or uploaded a list with your details. YouTube and TikTok exports don&rsquo;t.
        </EmptyState>
      ) : (
        <>
          <div className="list" id={listId}>
            {shown.map((a) => (
              <div className="row" key={a.name}>
                <span className="grow">
                  <b style={{ fontSize: 15 }}>{a.name}</b>
                  <span className="tiny">
                    {joinAnd(a.platforms.map((p) => PLATFORM_LABEL[p]))}
                    {typeof a.count === 'number' ? '' : ', holds your data'}
                  </span>
                </span>
                {typeof a.count === 'number' && <span className="count">{plural(a.count, 'ad')}</span>}
              </div>
            ))}
          </div>
          {advertisers.some((a) => typeof a.count !== 'number') && (
            <span className="tiny">&ldquo;Holds your data&rdquo; means the platform says this advertiser used your activity or a list with your details to reach you.</span>
          )}
          {advertisers.length > SHOW_FIRST && (
            <button type="button" className="btn btn-2" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${num(advertisers.length)}`}
            </button>
          )}
        </>
      )}

      <h2>Ad tricks</h2>
      {ads.tactics.length === 0 ? (
        <div className="outline note">
          <Icon name="info" />
          <span className="small">
            {ads.adItems
              ? 'Drift didn’t spot common pressure tricks in the ad titles it could read.'
              : 'No ad titles in your exports yet, so Drift can’t check them for tricks. YouTube marks videos that came from ads.'}
          </span>
        </div>
      ) : (
        <>
          <span className="small lead" style={{ marginTop: -4 }}>
            Drift read the titles of your ads and found {plural(tacticAds, 'ad')} using pressure tricks.
          </span>
          {ads.tactics.map((t) => <TacticCard key={t.id} t={t} />)}
        </>
      )}

      <h2>Take action</h2>
      <span className="small" style={{ marginTop: -4 }}>Official settings on each platform. They open on the platform&rsquo;s own site.</span>
      {actions.map((g) => (
        <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 className="group-label" style={{ margin: '4px 0 0 4px' }}>{g.label}</h3>
          <div className="list">
            {g.links.map((l) => <ExternalRow key={l.href} {...l} />)}
          </div>
        </div>
      ))}

      <div className="outline" style={{ marginTop: 4 }}>
        <b className="b16">Ask an advertiser to delete your data</b>
        <span className="small">A ready-to-send request under GDPR Article 17. You copy it and send it yourself.</span>
        <button type="button" className="btn btn-line" aria-haspopup="dialog" onClick={() => setSheet(true)}>Write the request</button>
      </div>

      <RequestSheet open={sheet} onClose={() => setSheet(false)} advertisers={advertisers.map((a) => a.name)} />
    </Screen>
  );
}
