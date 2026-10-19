import { useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { DriftSettings } from '@/lib/types';
import { dateShort, num, platformLabel, plural } from '@/lib/ui/format';
import { RECOMPUTE_STAGES, STAGE_LABEL, stageFraction } from '@/lib/ui/stages';
import { useDrift } from '../../src/data/useDrift';
import { Icon } from '../../src/ui/Icon';
import { kvGet, kvSet } from '../../src/ui/kv';
import {
  Bottom, Btn, Card, ErrorCard, Grow, GroupLabel, H1, List, Loading, Meter, Note, Outline, Radio, Row, Screen, Sheet, SwitchRow, T, useToast,
} from '../../src/ui/kit';

type Keep = '1y' | '2y' | 'forever';
const KEEP: { value: Keep; label: string }[] = [
  { value: '1y', label: '1 year' },
  { value: '2y', label: '2 years' },
  { value: 'forever', label: 'Until I delete it' },
];

function historySpan(months: number): string {
  if (months < 1) return 'no history yet';
  if (months < 24) return `${plural(months, 'month')} of history`;
  return `${Math.floor(months / 12)} years of history`;
}

export default function DataScreen() {
  const toast = useToast();
  const { insights, isSample, imports, status, deleteAll, settings, updateSettings, recompute, progress } = useDrift();
  const [keep, setKeep] = useState<Keep>(() => {
    const v = kvGet('drift.keep');
    return v === '1y' || v === 'forever' ? v : '2y';
  });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const locked = status !== 'ready' || isSample || running || busy !== null;
  const frac = stageFraction(progress, RECOMPUTE_STAGES);

  function onToggle(key: keyof DriftSettings, value: boolean) {
    updateSettings({ [key]: value });
    setPending(true);
    setRan(false);
  }

  async function onUpdate() {
    setPending(false);
    setRunning(true);
    setRan(false);
    await recompute();
    setRunning(false);
    setRan(true);
  }

  const summary = isSample
    ? 'Nothing imported yet. Drift is showing sample data.'
    : `${plural(insights.platforms.length, 'platform')}, ${historySpan(insights.months.length)}`;

  async function onExport() {
    setBusy('export');
    try {
      // Computed results only: per-item titles and links are stripped, like the web export.
      const payload = {
        app: 'drift',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        note: 'Computed results only. Your raw watch, search and ad history is not included.',
        insights: {
          ...insights,
          topics: Object.fromEntries(Object.entries(insights.topics ?? {}).map(([k, t]) => [k, { ...t, recentItems: [] }])),
        },
        imports: imports.map((r) => ({ id: r.id, platform: r.platform, importedAt: r.importedAt, fileName: r.fileName, events: r.events, newEvents: r.newEvents, warnings: r.warnings })),
      };
      const json = JSON.stringify(payload, null, 2);
      const name = `drift-results-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (await Sharing.isAvailableAsync()) {
        const file = new File(Paths.cache, name);
        if (file.exists) file.delete();
        file.create();
        file.write(json);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Drift results' });
      } else {
        await Share.share({ message: json });
      }
      toast('Your results file is ready to save.');
    } catch {
      toast('Couldn’t create the results file. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    setBusy('delete');
    try {
      await deleteAll();
      setConfirm(false);
      toast('Everything Drift stored on this phone was deleted.');
    } catch {
      toast('Couldn’t delete your data. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const DELETE_BODY = 'This removes your imported history, your results and your import list from this phone. It can’t be undone. Your original export files are not touched.';
  function askDelete() {
    if (Platform.OS === 'web') { setConfirm(true); return; }
    Alert.alert('Delete all your data?', DELETE_BODY, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: () => { void onDelete(); } },
    ]);
  }

  return (
    <Screen back="/settings">
      <H1>Data and privacy</H1>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="phone" size={18} /><T v="b15">Stored only on this phone</T>
        </View>
        <T v="small">{status === 'ready' ? summary : ' '}</T>
      </Card>

      <GroupLabel>Imports</GroupLabel>
      {status !== 'ready' ? (
        <Loading blocks={[56]} />
      ) : imports.length === 0 ? (
        <List><Row><T v="small">No imports yet.</T></Row></List>
      ) : (
        <List>
          {[...imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map((im) => (
            <Row key={im.id}><Grow title={im.fileName} detail={`${platformLabel(im.platform)}, ${dateShort(im.importedAt)}, ${num(im.events)} items`} /></Row>
          ))}
        </List>
      )}

      <GroupLabel>Keep my history for</GroupLabel>
      <View accessibilityRole="radiogroup">
        <List>
          {KEEP.map((k) => (
            <Row key={k.value} onPress={() => { setKeep(k.value); kvSet('drift.keep', k.value); }} label={k.label}>
              <T v="body" style={{ flex: 1 }}>{k.label}</T>
              <Radio on={keep === k.value} />
            </Row>
          ))}
        </List>
      </View>

      <GroupLabel>How Drift reads your history</GroupLabel>
      <List>
        <SwitchRow
          title="Smarter topics"
          detail="Uses a language model on this phone to sort videos into topics. Downloads about 120 MB once."
          checked={settings.smartTopics}
          disabled={locked}
          onChange={(v) => onToggle('smartTopics', v)}
        />
        <SwitchRow
          title="Look up missing video titles"
          detail="Sends only video links to YouTube and TikTok to fetch titles. Helps with TikTok, whose export has no titles. Off by default."
          checked={settings.titleLookup}
          disabled={locked}
          onChange={(v) => onToggle('titleLookup', v)}
        />
      </List>
      {isSample && status === 'ready' && (
        <T v="tiny">These change how Drift reads your own history. Import an export first to use them.</T>
      )}

      {running ? (
        <Outline>
          <T v="b15">{STAGE_LABEL[progress?.stage ?? 'analysing']}</T>
          <Meter fraction={frac} label="Update progress" />
          <T v="small">{progress?.message && progress.message !== 'Starting' ? progress.message : 'Updating your results on this phone.'}</T>
        </Outline>
      ) : pending ? (
        <Card>
          <T v="b15">Update your results with this change?</T>
          <T v="small">
            Drift re-reads the history already on this phone.{settings.smartTopics ? ' The first time, the topic model downloads before sorting starts.' : ''}
            {' '}New imports use your settings either way.
          </T>
          <Btn onPress={onUpdate}>Update my results</Btn>
          <Btn kind="text" onPress={() => setPending(false)}>Not now</Btn>
        </Card>
      ) : ran && progress?.stage === 'error' ? (
        <ErrorCard title="We couldn’t update your results">
          <T v="small">{progress.message}</T>
          <T v="tiny">Your previous results are still here.</T>
          <Btn kind="secondary" onPress={onUpdate}>Try again</Btn>
        </ErrorCard>
      ) : ran && progress?.stage === 'done' ? (
        <Note icon="check">{insights.classifierNote ?? 'Your results are up to date with these settings.'}</Note>
      ) : null}

      <Bottom>
        <Btn kind="secondary" onPress={onExport} disabled={busy !== null || isSample || running}>{busy === 'export' ? 'Preparing…' : 'Export my results'}</Btn>
        {isSample && status === 'ready' && <T v="tiny" style={{ textAlign: 'center' }}>Import an export first to save your results.</T>}
        <Btn kind="danger" onPress={askDelete} disabled={busy !== null || running}>Delete all my data</Btn>
        <T v="tiny" style={{ textAlign: 'center' }}>Deleting removes every import and result stored on this phone.</T>
      </Bottom>

      <Sheet open={confirm} onClose={() => busy === null && setConfirm(false)} title="Delete all your data?" alert>
        <T v="small">{DELETE_BODY}</T>
        <Btn kind="dangerSolid" onPress={() => { void onDelete(); }} disabled={busy !== null}>{busy === 'delete' ? 'Deleting…' : 'Delete everything'}</Btn>
        <Btn kind="secondary" onPress={() => setConfirm(false)} disabled={busy !== null}>Cancel</Btn>
      </Sheet>
    </Screen>
  );
}
