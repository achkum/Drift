import { useDrift } from '../src/data/useDrift';
import { B, ChosenSummary, EmptyState, H1, H2, Loading, Note, PlatformChosen, Screen, T } from '../src/ui/kit';
import { PLATFORM_LABEL } from '@/lib/ui/format';

export default function Chosen() {
  const { insights, status } = useDrift();
  const c = insights.chosen;
  const platforms = c.byPlatform.filter((p) => p.items > 0);
  const empty = platforms.length === 0 && c.chosenPct + c.servedPct === 0;

  return (
    <Screen back="/home">
      <H1>Chosen vs served</H1>
      <T v="small" style={{ marginTop: -6 }}>Last {c.windowDays} days, all platforms</T>
      {status !== 'ready' ? (
        <Loading blocks={[190, 40, 40, 40]} />
      ) : empty ? (
        <EmptyState title="Not enough recent activity" action={{ href: '/connect', label: 'Add an export' }}>
          Drift needs viewing from the last {c.windowDays} days to tell what you chose from what you were served.
        </EmptyState>
      ) : (
        <>
          <ChosenSummary chosenPct={c.chosenPct}>
            <T v="small"><B>Chosen:</B> you watched it after a search, it came from a channel you follow or subscribe to, or you keep coming back to that channel on your own.</T>
            <T v="small"><B>Served:</B> everything else the platform put in front of you.</T>
          </ChosenSummary>
          {platforms.length > 0 && <H2>By platform</H2>}
          {platforms.map((p) => <PlatformChosen key={p.platform} name={PLATFORM_LABEL[p.platform]} pct={p.chosenPct} />)}
          <Note>An estimate. Platforms don’t share what they recommended, only what you opened.</Note>
        </>
      )}
    </Screen>
  );
}
