'use client';
import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle, Screen } from '../Screen';
import { Icon } from '../Icon';
import { Note } from '../bits';
import { Uploader } from '../Uploader';
import { exportGuides } from '@/lib/parsers/guides';
import { useDrift } from '@/lib/pipeline/useDrift';
import { setOnboarded } from '@/lib/ui/prefs';
import type { UploadPlatform } from '@/lib/ui/platforms';

/** Renders **bold** segments as <b>. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function UploadScreen({ platform }: { platform: UploadPlatform }) {
  const router = useRouter();
  const guide = exportGuides[platform];
  const { importFiles, progress } = useDrift();
  const steps = guide.steps.filter((s) => s.trim());
  const notes = guide.notes.filter((s) => s.trim());

  return (
    <Screen back="/connect">
      <PageTitle>{guide.title}</PageTitle>
      {guide.intro && <p className="sub lead">{guide.intro}</p>}

      {steps.length > 0 && (
        <ol className="steps" style={{ marginTop: 6 }}>
          {steps.map((s, i) => (
            <li key={i}><span aria-hidden="true">{i + 1}</span><span><span className="sr-only">Step {i + 1}: </span><RichText text={s} /></span></li>
          ))}
        </ol>
      )}

      {guide.startUrl && (
        <a className="btn btn-line" href={guide.startUrl} target="_blank" rel="noopener noreferrer">
          Start the export
          <Icon name="external" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}

      {guide.waitTime && (
        <div className="card hrow" style={{ gap: 12 }}>
          <Icon name="clock" className="ic-inline" style={{ stroke: 'var(--t2)' }} />
          <span><b className="b15">How long it takes</b><span className="small"><RichText text={guide.waitTime} /></span></span>
        </div>
      )}

      {notes.map((n, i) => <Note key={i}><RichText text={n} /></Note>)}

      <h2>Upload your export</h2>
      <Uploader
        hint={guide.uploadHint ? `Upload ${guide.uploadHint.replace(/^upload\s+/i, '')}` : undefined}
        progress={progress}
        importFiles={importFiles}
        onFinished={() => { setOnboarded(true); router.push('/home'); }}
      />
    </Screen>
  );
}
