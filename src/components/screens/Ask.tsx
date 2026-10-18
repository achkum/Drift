'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BackButton } from '../BackButton';
import { Icon } from '../Icon';
import { PageTitle } from '../Screen';
import { useDrift } from '@/lib/pipeline/useDrift';
import { answerQuestion, suggestedQuestions } from '@/lib/ask';
import { ASK, type AskKey } from '@/lib/sample/household';

interface Msg {
  id: number;
  role: 'me' | 'ai';
  paragraphs: string[];
  basis?: string;
}

const BACK: Record<AskKey, string> = { you: '/home', sam: '/household/sam', maya: '/household/maya', household: '/household' };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export function AskScreen({ about }: { about: AskKey }) {
  const script = ASK[about];
  const { insights, isSample, status } = useDrift();
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: 0, role: 'ai', paragraphs: [script.intro] }]);
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  const isYou = about === 'you';
  const questions: string[] = isYou
    ? (status === 'ready' ? suggestedQuestions(insights) : [])
    : script.qs.map((x) => x.q);
  const chips = questions.filter((q) => !asked.has(norm(q)));

  function answerFor(q: string): Omit<Msg, 'id' | 'role'> {
    if (isYou) {
      const a = answerQuestion(q, insights);
      const paragraphs = a.paragraphs.filter((p) => p.trim());
      return paragraphs.length ? { paragraphs, basis: a.basis || undefined } : { paragraphs: [script.fallback] };
    }
    const hit = script.qs.find((x) => norm(x.q) === norm(q));
    return hit ? { paragraphs: hit.a, basis: hit.basis } : { paragraphs: [script.fallback] };
  }

  function ask(q: string) {
    const question = q.trim();
    if (!question || typing) return;
    setAsked((s) => new Set(s).add(norm(question)));
    setMsgs((m) => [...m, { id: nextId.current++, role: 'me', paragraphs: [question] }]);
    setTyping(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      const a = answerFor(question);
      setMsgs((m) => [...m, { id: nextId.current++, role: 'ai', ...a }]);
      setTyping(false);
    }, reduce ? 0 : 900);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = text;
    setText('');
    ask(v);
  }

  return (
    <main className="screen ask">
      <div className="top">
        <BackButton fallback={BACK[about]} />
        <span className="step" style={{ fontWeight: 700, color: 'var(--t1)' }}>{script.who}</span>
      </div>
      <div className="ask-head">
        <PageTitle style={{ fontSize: 24 }}>Ask Drift</PageTitle>
        <p className="small" style={{ marginTop: 6 }}>
          {about !== 'you' && <span className="preview-tag">Preview</span>}
          {script.note}
          {isYou && isSample && status === 'ready' && ' Showing sample data until you add an export.'}
        </p>
      </div>
      <div className="chat" ref={chatRef} aria-live="polite" aria-relevant="additions">
        {msgs.map((m) => (
          m.role === 'me' ? (
            <div key={m.id} className="msg msg-me"><span className="sr-only">You asked: </span>{m.paragraphs[0]}</div>
          ) : (
            <div key={m.id} className="msg msg-ai">
              <span className="sr-only">Drift: </span>
              {m.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              {m.basis && <div className="basis">{m.basis}</div>}
            </div>
          )
        ))}
        {typing && (
          <div className="msg msg-ai">
            <div className="typing" role="status" aria-label="Drift is thinking"><i /><i /><i /></div>
          </div>
        )}
      </div>
      {chips.length > 0 && (
        <div className="qchips" role="group" aria-label="Suggested questions">
          {chips.map((q) => (
            <button key={q} type="button" className="qchip" disabled={typing} onClick={() => ask(q)}>{q}</button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={onSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question"
          aria-label="Ask a question"
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" aria-label="Send" disabled={typing || !text.trim()}><Icon name="send" /></button>
      </form>
    </main>
  );
}
