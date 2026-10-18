'use client';
import { PageTitle, Screen } from '../Screen';
import { ChosenSummary, EmptyState, Loading, Note, PlatformChosen } from '../bits';
import { useDrift } from '@/lib/pipeline/useDrift';
import { PLATFORM_LABEL } from '@/lib/ui/format';

export function ChosenScreen() {
  const { insights, status } = useDrift();
  const c = insights.chosen;
  const platforms = c.byPlatform.filter((p) => p.items > 0);
  const empty = platforms.length === 0 && c.chosenPct + c.servedPct === 0;

  return (
    <Screen tabbed back="/home">
      <PageTitle>Chosen vs served</PageTitle>
      <p className="small lead">Last {c.windowDays} days, all platforms</p>
      {status !== 'ready' ? (
        <Loading blocks={[190, 40, 40, 40]} />
      ) : empty ? (
        <EmptyState title="Not enough recent activity" action={{ href: '/connect', label: 'Add an export' }}>
          Drift needs viewing from the last {c.windowDays} days to tell what you chose from what you were served.
        </EmptyState>
      ) : (
        <>
          <ChosenSummary chosenPct={c.chosenPct}>
            <span className="small"><b className="t1">Chosen:</b> you watched it after a search, it came from a channel you follow or subscribe to, or you keep coming back to that channel on your own.</span>
            <span className="small"><b className="t1">Served:</b> everything else the platform put in front of you.</span>
          </ChosenSummary>
          {platforms.length > 0 && <h2>By platform</h2>}
          {platforms.map((p) => <PlatformChosen key={p.platform} name={PLATFORM_LABEL[p.platform]} pct={p.chosenPct} />)}
          <Note>An estimate. Platforms don&rsquo;t share what they recommended, only what you opened.</Note>
        </>
      )}
    </Screen>
  );
}
