import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ImportRecord, Insights, Platform } from '@/lib/types';
import { UPLOAD_LABEL, UPLOAD_PLATFORMS, type UploadPlatform } from '@/lib/ui/platforms';
import { dateShort, num } from '@/lib/ui/format';
import { useDrift } from '../data/useDrift';
import { Icon } from './Icon';
import { Bottom, Btn, BtnSm, Grow, H1, List, Mono, Row, Screen, T } from './kit';
import { StepLabel, StepProgress } from './onboarding';
import { setOnboarded, useTheme } from './theme';

const MATCHES: Record<UploadPlatform, Platform[]> = {
  youtube: ['youtube', 'google_search'],
  tiktok: ['tiktok'],
  instagram: ['instagram'],
};

function isGoogleSync(i: ImportRecord): boolean {
  return i.fileName.startsWith('google-sync-');
}

export function importStatus(p: UploadPlatform, imports: ImportRecord[], insights: Insights, isSample: boolean): string | null {
  const own = imports
    .filter((i) => (i.platform !== 'mixed' && MATCHES[p].includes(i.platform)) || (p === 'youtube' && isGoogleSync(i)))
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  if (own.length) {
    const events = own.reduce((s, i) => s + i.events, 0);
    return `Imported ${dateShort(own[0].importedAt, false)}, ${num(events)} items`;
  }
  if (!isSample) {
    const items = insights.platforms.filter((x) => MATCHES[p].includes(x.platform)).reduce((s, x) => s + x.items, 0);
    if (items > 0) return `${num(items)} items imported`;
  }
  return null;
}

export function ConnectList({ onboarding }: { onboarding: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const { imports, insights, isSample, status } = useDrift();
  const mixed = imports.filter((i) => i.platform === 'mixed' && !isGoogleSync(i));
  const finish = () => { setOnboarded(true); router.replace('/home'); };

  return (
    <Screen
      back={onboarding ? '/onboarding/privacy' : '/settings'}
      right={onboarding ? <StepLabel step={3} /> : undefined}
      contentStyle={onboarding ? { paddingTop: 28 } : undefined}
    >
      {onboarding && <View style={{ marginHorizontal: -20, marginTop: -28, marginBottom: 12 }}><StepProgress step={3} /></View>}
      <H1>{onboarding ? 'Connect your platforms' : 'Connected platforms'}</H1>
      <T v="sub" style={{ marginTop: -6 }}>Start with one. The more you add, the fuller the picture.</T>

      <List>
        {UPLOAD_PLATFORMS.map((p) => {
          const done = status === 'ready' ? importStatus(p, imports, insights, isSample) : null;
          return (
            <Row key={p}>
              <Mono text={p === 'youtube' ? 'G' : UPLOAD_LABEL[p][0]} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="b16">{UPLOAD_LABEL[p]}</T>
                {done ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="check" size={14} color={c.accentT} stroke={2.4} />
                    <T v="small" color={c.accentT} style={{ flex: 1 }}>{done}</T>
                  </View>
                ) : (
                  <T v="small">Upload your data export</T>
                )}
              </View>
              <BtnSm ghost={!!done} href={`/connect/${p}`} label={`${done ? 'Update' : 'Start'} ${UPLOAD_LABEL[p]}`}>{done ? 'Update' : 'Start'}</BtnSm>
            </Row>
          );
        })}
        {(['Facebook', 'X'] as const).map((name) => (
          <Row key={name}>
            <Mono text={name[0]} off />
            <Grow title={name} detail="Coming later" titleSize={16} tiny={false} />
          </Row>
        ))}
      </List>

      {mixed.length > 0 && (
        <T v="small">Also imported: {mixed.map((m) => `${m.fileName} (${dateShort(m.importedAt, false)})`).join(', ')}.</T>
      )}
      <T v="small">Exports are read on this phone. Nothing is uploaded.</T>

      {onboarding && <Bottom><Btn onPress={finish}>See my insights</Btn></Bottom>}
    </Screen>
  );
}
