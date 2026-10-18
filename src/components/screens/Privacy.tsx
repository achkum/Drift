import Link from 'next/link';
import { Icon, type IconName } from '../Icon';
import { PageTitle, Screen, StepProgress } from '../Screen';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'phone', title: 'Analysed on this device', text: 'Your watch and search history is read here and never uploaded to us.' },
  { icon: 'people', title: 'You decide what to share', text: 'Nothing reaches household members unless you turn it on, topic by topic.' },
  { icon: 'lock', title: 'Sensitive topics stay private', text: 'Political, health and other sensitive insights are only ever shown to you.' },
  { icon: 'trash', title: 'Delete anytime', text: 'Remove everything in one step from Settings.' },
];

export function PrivacyScreen() {
  return (
    <Screen
      back="/onboarding/who"
      right={<span className="step">Step 2 of 3</span>}
      beforeScroll={<StepProgress step={2} />}
      scrollClassName="ob"
      scrollStyle={{ gap: 22 }}
    >
      <PageTitle>Your data stays on your device</PageTitle>
      {FEATURES.map((f) => (
        <div className="feature" key={f.title}>
          <div className="ic"><Icon name={f.icon} /></div>
          <div><b>{f.title}</b><p className="small">{f.text}</p></div>
        </div>
      ))}
      <div className="bottom"><Link href="/connect" className="btn">I understand</Link></div>
    </Screen>
  );
}
