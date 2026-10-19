import { View } from 'react-native';
import { joinAnd, platformInitial, PLATFORM_LABEL } from '@/lib/ui/format';
import { useDrift } from '../src/data/useDrift';
import { B, Card, Chips, EmptyState, H1, Loading, Mono, Outline, Screen, T } from '../src/ui/kit';
import { useTheme } from '../src/ui/theme';

export default function Platforms() {
  const { c } = useTheme();
  const { insights, status } = useDrift();
  const withLists = insights.platformInterests.filter((p) => p.interests.length > 0);
  const listed = new Set(withLists.map((p) => p.platform));
  const without = insights.platforms.map((p) => p.platform).filter((p) => !listed.has(p));

  return (
    <Screen back="/home">
      <H1>How platforms see you</H1>
      <T v="small" style={{ marginTop: -6 }}>The interests each platform has assigned you, next to what you actually spend time on.</T>
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
              <Outline key={p.platform} style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Mono text={platformInitial(p.platform)} size={32} />
                  <T v="b17" style={{ flex: 1 }}>{PLATFORM_LABEL[p.platform]}</T>
                  <T v="tiny">From your export</T>
                </View>
                <T v="label">Thinks you’re into</T>
                <Chips items={p.interests.map((i) => ({ name: i.name, match: i.matches }))} />
                <T v="small">
                  <B color={c.accentT}>{matches} of {p.interests.length}</B> match what you actually watch.
                  {matches < p.interests.length ? ' The rest come from ads and accounts you never opened.' : ''}
                </T>
              </Outline>
            );
          })}
          {without.length > 0 && (
            <Outline>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Mono text={platformInitial(without[0])} size={32} />
                <T v="b17" style={{ flex: 1 }}>{joinAnd(without.map((p) => PLATFORM_LABEL[p]))}</T>
              </View>
              <T v="small">
                {without.length === 1 ? 'This export has' : 'These exports have'} no interest list. Drift builds one from your activity instead.
              </T>
            </Outline>
          )}
          {insights.actualTopics.length > 0 && (
            <Card>
              <T v="b16">You actually spend time on</T>
              <T style={{ fontSize: 15, lineHeight: 22 }}>{insights.actualTopics.join(', ')}</T>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
