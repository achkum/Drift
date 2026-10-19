'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BackButton } from '../BackButton';
import { Icon } from '../Icon';
import { PageTitle } from '../Screen';
import { Loading } from '../bits';
import { useHouseholdLive, type LiveHousehold } from '../HouseholdProvider';
import { LockedCard } from '../household/SummaryPanels';
import { useDrift } from '@/lib/pipeline/useDrift';
import { answerQuestion, suggestedQuestions } from '@/lib/ask';
import { answerAboutMember, suggestedAboutMember } from '@/lib/household/ask';
import { ASK, type AskKey } from '@/lib/sample/household';
import { firstName } from '@/lib/ui/useHousehold';

interface Msg {
  id: number;
  role: 'me' | 'ai';
  paragraphs: string[];
  basis?: string;
}
type Answer = Omit<Msg, 'id' | 'role'>;

const BACK: Record<AskKey, string> = { you: '/home', sam: '/household/sam', maya: '/household/maya', household: '/household' };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * `about`: 'you', 'household', a real member id, or the sample people 'sam' / 'maya'.
 * The sample people, and the household under ?preview=1 or without a household, use scripted answers.
 */
export function AskScreen({ about, preview = false }: { about: string; preview?: boolean }) {
  const hh = useHouseholdLive();
  if (about === 'you') return <OwnAsk />;
  if (about === 'sam' || about === 'maya') return <SampleAsk about={about} />;
  if (about === 'household' && preview) return <SampleAsk about="household" />;
  if (hh.status === 'loading') return <ChatShell who="Ask Drift" back="/household" note=" "><Loading blocks={[80, 80]} /></ChatShell>;
  if (about === 'household') return hh.inHousehold ? <HouseholdAsk hh={hh} /> : <SampleAsk about="household" />;
  return <MemberAsk hh={hh} memberId={about} />;
}

// ── own data ────────────────────────────────────────────

function OwnAsk() {
  const script = ASK.you;
  const { insights, isSample, status } = useDrift();
  const questions = status === 'ready' ? suggestedQuestions(insights) : [];
  return (
    <Chat
      who={script.who}
      back={BACK.you}
      note={<>{script.note}{isSample && status === 'ready' && ' Showing sample data until you add an export.'}</>}
      intro={script.intro}
      questions={questions}
      answer={async (q) => {
        const a = answerQuestion(q, insights);
        const paragraphs = a.paragraphs.filter((p) => p.trim());
        return paragraphs.length ? { paragraphs, basis: a.basis || undefined } : { paragraphs: [script.fallback] };
      }}
    />
  );
}

// ── sample people (Preview) ─────────────────────────────

function SampleAsk({ about }: { about: AskKey }) {
  const script = ASK[about];
  return (
    <Chat
      who={script.who}
      back={about === 'household' ? '/household?preview=1' : BACK[about]}
      note={<><span className="preview-tag">Preview</span>{script.note}</>}
      intro={script.intro}
      questions={script.qs.map((x) => x.q)}
      answer={async (q) => {
        const hit = script.qs.find((x) => norm(x.q) === norm(q));
        return hit ? { paragraphs: hit.a, basis: hit.basis } : { paragraphs: [script.fallback] };
      }}
    />
  );
}

// ── a real member ───────────────────────────────────────

async function logThenAnswer(memberId: string, q: string, name: string, hh: LiveHousehold) {
  const r = hh.summaries[memberId];
  if (!r) throw new Error(`${name} hasn’t shared anything with you.`);
  const a = answerAboutMember(q, r.summary, name);
  const { logQuestion } = await import('@/lib/household');
  // The member must see the question before you see the answer.
  await logQuestion(memberId, q, a.categories);
  return a;
}

function MemberAsk({ hh, memberId }: { hh: LiveHousehold; memberId: string }) {
  const m = hh.members.find((x) => x.memberId === memberId && !x.isMe);
  const r = hh.summaries[memberId];
  const name = firstName(m?.displayName ?? r?.displayName);
  const back = `/household/${encodeURIComponent(memberId)}`;
  if (!m || !r?.summary.allowQuestions) {
    return (
      <ChatShell who={`About ${name}`} back={back} note={`${name} decides whether Drift answers questions about them.`}>
        <LockedCard name={name} cat="questions">
          <span className="small">{m ? `${name} hasn’t allowed questions. Until they do, Drift won’t answer anything about them.` : 'This person isn’t in your household.'}</span>
        </LockedCard>
        <Link href={back} className="btn btn-2">Back</Link>
      </ChatShell>
    );
  }
  return (
    <Chat
      who={`About ${name}`}
      back={back}
      note={`Answers are worked out on this device from what ${name} allowed. ${name} sees every question you ask.`}
      intro={`Ask me about ${name}’s feed. I use only what ${name} has shared with you, and I never show individual videos or messages. Answers are estimates, not diagnoses.`}
      questions={suggestedAboutMember(r.summary, name)}
      answer={async (q) => {
        try {
          const a = await logThenAnswer(memberId, q, name, hh);
          return { paragraphs: a.paragraphs, basis: `${a.basis} ${name} can see this question.` };
        } catch (e) {
          const code = (e as { code?: string })?.code;
          void hh.refresh();
          return {
            paragraphs: [code === 'questions_not_allowed'
              ? `${name} no longer allows questions, so Drift didn’t answer.`
              : `Drift couldn’t tell ${name} about this question, so it didn’t answer. ${(e as Error)?.message ?? ''}`.trim()],
          };
        }
      }}
    />
  );
}

// ── the whole household ─────────────────────────────────

function HouseholdAsk({ hh }: { hh: LiveHousehold }) {
  const askable = hh.members.filter((m) => !m.isMe && m.status === 'active' && hh.summaries[m.memberId]?.summary.allowQuestions);
  const names = askable.map((m) => firstName(m.displayName));
  const questions = [
    hh.myInsights ? 'What is my feed pushing most?' : null,
    ...askable.slice(0, 2).map((m) => suggestedAboutMember(hh.summaries[m.memberId].summary, firstName(m.displayName))[0]),
    'What changed this week?',
  ].filter((q): q is string => !!q);
  return (
    <Chat
      who="About the household"
      back="/household"
      note="Uses only what each member allows. Each member sees the questions asked about them."
      intro={askable.length
        ? `Ask me about the household. I answer from your own data and from what ${names.join(', ')} allow${askable.length === 1 ? 's' : ''}.`
        : 'Nobody in your household allows questions yet, so I can only answer about you.'}
      questions={questions}
      answer={async (q) => {
        const paragraphs: string[] = [];
        const asked: string[] = [];
        if (hh.myInsights) {
          const a = answerQuestion(q, hh.myInsights);
          if (a.paragraphs[0]) paragraphs.push(`You: ${a.paragraphs[0]}`);
        }
        for (const m of askable) {
          const name = firstName(m.displayName);
          try {
            const a = await logThenAnswer(m.memberId, q, name, hh);
            if (a.paragraphs[0]) paragraphs.push(`${name}: ${a.paragraphs[0]}`);
            asked.push(name);
          } catch { /* not logged → not answered for this person */ }
        }
        if (!paragraphs.length) return { paragraphs: ['I have nothing to answer from yet. Import your data, or ask members to allow questions.'] };
        return { paragraphs, basis: `Based on what each person allows.${asked.length ? ` ${asked.join(', ')} can see this question.` : ''}` };
      }}
    />
  );
}

// ── chat UI ─────────────────────────────────────────────

function ChatShell({ who, back, note, children }: { who: string; back: string; note: ReactNode; children?: ReactNode }) {
  return (
    <main className="screen ask">
      <div className="top">
        <BackButton fallback={back} />
        <span className="step" style={{ fontWeight: 700, color: 'var(--t1)' }}>{who}</span>
      </div>
      <div className="ask-head">
        <PageTitle style={{ fontSize: 24 }}>Ask Drift</PageTitle>
        <p className="small" style={{ marginTop: 6 }}>{note}</p>
      </div>
      {children && <div className="chat" style={{ gap: 14 }}>{children}</div>}
    </main>
  );
}

function Chat({ who, back, note, intro, questions, answer }: {
  who: string;
  back: string;
  note: ReactNode;
  intro: string;
  questions: string[];
  answer(q: string): Promise<Answer>;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: 0, role: 'ai', paragraphs: [intro] }]);
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  const chips = questions.filter((q) => !asked.has(norm(q)));

  async function ask(q: string) {
    const question = q.trim();
    if (!question || typing) return;
    setAsked((s) => new Set(s).add(norm(question)));
    setMsgs((m) => [...m, { id: nextId.current++, role: 'me', paragraphs: [question] }]);
    setTyping(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [a] = await Promise.all([answer(question), new Promise((r) => setTimeout(r, reduce ? 0 : 900))]);
    if (!alive.current) return;
    setMsgs((m) => [...m, { id: nextId.current++, role: 'ai', ...a }]);
    setTyping(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = text;
    setText('');
    void ask(v);
  }

  return (
    <main className="screen ask">
      <div className="top">
        <BackButton fallback={back} />
        <span className="step" style={{ fontWeight: 700, color: 'var(--t1)' }}>{who}</span>
      </div>
      <div className="ask-head">
        <PageTitle style={{ fontSize: 24 }}>Ask Drift</PageTitle>
        <p className="small" style={{ marginTop: 6 }}>{note}</p>
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
            <button key={q} type="button" className="qchip" disabled={typing} onClick={() => void ask(q)}>{q}</button>
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

