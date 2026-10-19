import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { exportGuides } from '@/lib/parsers/guides';
import { isUploadPlatform } from '@/lib/ui/platforms';
import { useDrift } from '../../src/data/useDrift';
import { Icon } from '../../src/ui/Icon';
import { Btn, EmptyState, H1, H2, Note, openUrl, RichText, Screen, T } from '../../src/ui/kit';
import { Uploader } from '../../src/ui/Uploader';
import { setOnboarded, useTheme } from '../../src/ui/theme';

export default function ConnectPlatform() {
  const { platform } = useLocalSearchParams<{ platform: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { importFiles, progress } = useDrift();

  if (!platform || !isUploadPlatform(platform)) {
    return (
      <Screen back="/connect">
        <H1>Platform not found</H1>
        <EmptyState title="Nothing to show" action={{ href: '/connect', label: 'Back to platforms' }}>
          Drift can import YouTube, TikTok and Instagram exports.
        </EmptyState>
      </Screen>
    );
  }

  const guide = exportGuides[platform];
  const steps = guide.steps.filter((s) => s.trim());
  const notes = guide.notes.filter((s) => s.trim());

  return (
    <Screen back="/connect">
      <H1>{guide.title}</H1>
      {guide.intro ? <T v="sub" style={{ marginTop: -6 }}>{guide.intro}</T> : null}

      {steps.length > 0 && (
        <View style={{ gap: 16, marginTop: 6 }}>
          {steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 14 }} accessible accessibilityLabel={`Step ${i + 1}: ${s.replace(/\*\*/g, '')}`}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.btn, alignItems: 'center', justifyContent: 'center' }}>
                <T w={700} color={c.btnT} style={{ fontSize: 14, lineHeight: 18 }}>{i + 1}</T>
              </View>
              <View style={{ flex: 1 }}><RichText text={s} /></View>
            </View>
          ))}
        </View>
      )}

      {guide.startUrl ? (
        <Btn kind="line" ext label="Start the export, opens in your browser" onPress={() => openUrl(guide.startUrl!)}>Start the export</Btn>
      ) : null}

      {guide.waitTime ? (
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: c.surface, borderRadius: 18, padding: 16, alignItems: 'flex-start' }}>
          <Icon name="clock" size={22} color={c.t2} />
          <View style={{ flex: 1 }}>
            <T v="b15">How long it takes</T>
            <RichText text={guide.waitTime} v="small" />
          </View>
        </View>
      ) : null}

      {notes.map((n, i) => <Note key={i}><RichText text={n} v="small" /></Note>)}

      <H2>Upload your export</H2>
      <Uploader
        hint={guide.uploadHint ? `Upload ${guide.uploadHint.replace(/^upload\s+/i, '')}` : undefined}
        progress={progress}
        importFiles={importFiles}
        onFinished={() => { setOnboarded(true); router.replace('/home'); }}
      />
    </Screen>
  );
}
