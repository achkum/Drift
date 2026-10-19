// File picking and import progress. Uses expo-document-picker; the data layer (useDrift.importFiles) reads the files.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { ImportProgress, ImportRecord } from '@/lib/types';
import { num, plural, platformLabel } from '@/lib/ui/format';
import { STAGE_LABEL, stageFraction } from '@/lib/ui/stages';
import type { PickedFile } from '../data/useDrift';
import { Icon } from './Icon';
import { Btn, ErrorCard, KV, Meter, Note, Outline, Split, T } from './kit';
import { useTheme } from './theme';

const TYPES = [
  'application/zip', 'application/x-zip-compressed', 'application/json', 'text/html', 'text/csv', 'text/comma-separated-values',
];

type State =
  | { kind: 'idle' }
  | { kind: 'working'; count: number }
  | { kind: 'done'; records: ImportRecord[] }
  | { kind: 'error'; message: string };

export function Uploader({ hint, progress, importFiles, onFinished }: {
  hint?: string;
  progress: ImportProgress | null;
  importFiles(files: PickedFile[]): Promise<ImportRecord[]>;
  onFinished(): void;
}) {
  const { c } = useTheme();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const progressAtStart = useRef<ImportProgress | null>(null);

  useEffect(() => {
    if (state.kind === 'working' && progress?.stage === 'error' && progress !== progressAtStart.current) {
      setState({ kind: 'error', message: progress.message || 'Something went wrong while reading the file.' });
    }
  }, [progress, state.kind]);

  async function run(files: PickedFile[]) {
    if (!files.length) return;
    progressAtStart.current = progress;
    setState({ kind: 'working', count: files.length });
    try {
      const records = await importFiles(files);
      setState((s) => (s.kind === 'error' ? s : { kind: 'done', records }));
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error && err.message ? err.message : 'Unknown error.' });
    }
  }

  async function choose() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: TYPES, multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      void run(res.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size })));
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Couldn’t open the file picker.' });
    }
  }

  if (state.kind === 'working') {
    const stage = progress?.stage ?? 'reading';
    const frac = stageFraction(progress);
    return (
      <Outline>
        <Split><T v="b15">{STAGE_LABEL[stage]}</T><T v="tiny">{plural(state.count, 'file')}</T></Split>
        <Meter fraction={frac} label="Import progress" />
        <T v="small">{progress?.message || 'Reading your export on this phone.'}</T>
      </Outline>
    );
  }

  if (state.kind === 'done') {
    const events = state.records.reduce((s, r) => s + r.events, 0);
    const fresh = state.records.reduce((s, r) => s + r.newEvents, 0);
    const warnings = state.records.flatMap((r) => r.warnings);
    return (
      <Outline>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="check" size={18} color={c.accent} stroke={2.4} />
          <T v="b16">{state.records.length ? 'Export added' : 'Nothing found to import'}</T>
        </View>
        {state.records.length > 0 ? (
          <>
            <KV left="Items read" right={num(events)} />
            <KV left="New since last import" right={num(fresh)} />
            {state.records.map((r) => <T v="tiny" key={r.id}>{platformLabel(r.platform)}: {r.fileName}</T>)}
          </>
        ) : (
          <T v="small">We couldn’t find watch or search history in these files. Check the steps above and try the .zip you downloaded.</T>
        )}
        {warnings.length > 0 && (
          <Note tone="amber" icon="warn">{warnings.join('\n')}</Note>
        )}
        <View style={{ gap: 10, marginTop: 4 }}>
          {state.records.length > 0 && <Btn onPress={onFinished}>See my insights</Btn>}
          <Btn kind="secondary" onPress={() => setState({ kind: 'idle' })}>Add another file</Btn>
        </View>
      </Outline>
    );
  }

  return (
    <>
      {state.kind === 'error' && (
        <ErrorCard title="We couldn’t import that">
          <T v="small">{state.message}</T>
          <T v="tiny">Nothing was saved. You can try again with the same file.</T>
        </ErrorCard>
      )}
      <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.mutedLine, borderRadius: 18, padding: 20, alignItems: 'center', gap: 12 }}>
        <Icon name="upload" size={28} color={c.t2} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T v="b15">Choose your export</T>
          <T v="small" style={{ textAlign: 'center' }}>{hint || 'The .zip file you downloaded.'}</T>
        </View>
        <Btn onPress={choose} large>Choose files</Btn>
        <T v="tiny" style={{ textAlign: 'center' }}>.zip, .json, .html or .csv. Read on this phone, never uploaded.</T>
      </View>
    </>
  );
}
