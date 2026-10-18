import type { CSSProperties, ReactNode } from 'react';
import { BackButton } from './BackButton';

interface ScreenProps {
  children: ReactNode;
  /** Leaves room for the tab bar. */
  tabbed?: boolean;
  /** Shows a top bar with a back button going to this route when there is no history. */
  back?: string;
  closeButton?: boolean;
  /** Right side of the top bar. */
  right?: ReactNode;
  /** Rendered between the top bar and the scroll area (onboarding progress). */
  beforeScroll?: ReactNode;
  className?: string;
  scrollClassName?: string;
  scrollStyle?: CSSProperties;
}

export function Screen({ children, tabbed, back, closeButton, right, beforeScroll, className, scrollClassName, scrollStyle }: ScreenProps) {
  return (
    <main className={['screen', tabbed && 'tabbed', className].filter(Boolean).join(' ')}>
      {back && (
        <div className="top">
          <BackButton fallback={back} close={closeButton} />
          {right}
        </div>
      )}
      {beforeScroll}
      <div className={['scroll', scrollClassName].filter(Boolean).join(' ')} style={scrollStyle}>
        {children}
      </div>
    </main>
  );
}

export function StepProgress({ step, of = 3 }: { step: number; of?: number }) {
  return (
    <div className="progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={of} aria-valuenow={step}>
      {Array.from({ length: of }, (_, i) => <span key={i} className={i < step ? 'done' : undefined} />)}
    </div>
  );
}

export function PageTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <h1 tabIndex={-1} style={style}>{children}</h1>;
}

export function PreviewTag() {
  return <span className="preview-tag">Preview</span>;
}
