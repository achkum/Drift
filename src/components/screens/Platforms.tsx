'use client';
import { PageTitle, Screen } from '../Screen';
import { EmptyState, Loading } from '../bits';
import { useDrift } from '@/lib/pipeline/useDrift';
import { joinAnd, platformInitial, PLATFORM_LABEL } from '@/lib/ui/format';

export function PlatformsScreen() {
  const { insights, status } = useDrift();
  const withLists = insights.platformInterests.filter((p) => p.interests.length > 0);
  const listed = new Set(withLists.map((p) => p.platform));
  const without = insights.platforms.map((p) => p.platform).filter((p) => !listed.has(p));

  return (
    <Screen tabbed back="/home">
      <PageTitle>How platforms see you</PageTitle>
      <p className="small lead">The interests each platform has assigned you, next to what you actually spend time on.</p>
      {status !== 'ready' ? (
        <Loading blocks={[180, 80, 80]} />
      ) : insights.platforms.length === 0 && withLists.length === 0 ? (
        <EmptyState title="No platforms yet" action={{ href: '/connect', label: 'Add an export' }}>
          Import an export to compare what a platform thinks you like with what you actually watch.
        </EmptyState>
      ) : (
        <>
          {withLists.map((p) => {
            const matches = p.interests.filter((i) => i.matches).length;
            return (
              <div className="outline" style={{ gap: 14 }} key={p.platform}>
                <div className="hrow" style={{ gap: 10 }}>
                  <span className="mono sm" aria-hidden="true">{platformInitial(p.platform)}</span>
                  <b style={{ fontSize: 17 }}>{PLATFORM_LABEL[p.platform]}</b>
                  <span className="tiny" style={{ marginLeft: 'auto' }}>From your export</span>
                </div>
                <span className="tiny" style={{ fontWeight: 700 }}>Thinks you&rsquo;re into</span>
                <ul className="chips" style={{ listStyle: 'none' }}>
                  {p.interests.map((i) => (
                    <li key={i.name} className={`chip${i.matches ? ' chip-match' : ''}`}>
                      {i.name}{i.matches && <span className="sr-only"> (matches your viewing)</span>}
                    </li>
                  ))}
                </ul>
                <span className="small">
                  <b className="up">{matches} of {p.interests.length}</b> match what you actually watch.
                  {matches < p.interests.length && ' The rest come from ads and accounts you never opened.'}
                </span>
              </div>
            );
          })}
          {without.length > 0 && (
            <div className="outline">
              <div className="hrow" style={{ gap: 10 }}>
                <span className="mono sm" aria-hidden="true">{platformInitial(without[0])}</span>
                <b style={{ fontSize: 17 }}>{joinAnd(without.map((p) => PLATFORM_LABEL[p]))}</b>
              </div>
              <span className="small">
                {without.length === 1 ? 'This export has' : 'These exports have'} no interest list. Drift builds one from your activity instead.
              </span>
            </div>
          )}
          {insights.actualTopics.length > 0 && (
            <div className="card">
              <b className="b16">You actually spend time on</b>
              <span style={{ fontSize: 15, lineHeight: '22px' }}>{insights.actualTopics.join(', ')}</span>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
