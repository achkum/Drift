import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { answerQuestion, suggestedQuestions } from '@/lib/ask';
import { ASK, isAskKey, type AskKey } from '@/lib/sample/household';
import { useDrift } from '../src/data/useDrift';
import { Icon } from '../src/ui/Icon';
import { Screen, T, useReducedMotion } from '../src/ui/kit';
import { FONT, useTheme } from '../src/ui/theme';

interface Msg { id: number; role: 'me' | 'ai'; paragraphs: string[]; basis?: string }
type Answer = Omit<Msg, 'id' | 'role'>;

const BACK: Record<AskKey, string> = { you: '/home', sam: '/household/sam', maya: '/household/maya', household: '/household' };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export default function Ask() {
  const { about } = useLocalSearchParams<{ about?: string }>();
  const key: AskKey = isAskKey(about) ? about : 'you';
  return key === 'you' ? <OwnAsk /> : <SampleAsk about={key} />;
}

function OwnAsk() {
  const script = ASK.you;
  const { insights, isSample, status } = useDrift();
  const questions = status === 'ready' ? suggestedQuestions(insights) : [];
  return (
    <Chat
      who={script.who}
      back={BACK.you}
      note={`${script.note}${isSample && status === 'ready' ? ' Showing sample data until you add an export.' : ''}`}
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

function SampleAsk({ about }: { about: AskKey }) {
  const script = ASK[about];
  return (
    <Chat
      who={script.who}
      back={BACK[about]}
      note={`PREVIEW. ${script.note}`}
      intro={script.intro}
      questions={script.qs.map((x) => x.q)}
      answer={async (q) => {
        const hit = script.qs.find((x) => norm(x.q) === norm(q));
        return hit ? { paragraphs: hit.a, basis: hit.basis } : { paragraphs: [script.fallback] };
      }}
    />
  );
}

function Chat({ who, back, note, intro, questions, answer }: {
  who: string; back: string; note: string; intro: string; questions: string[]; answer(q: string): Promise<Answer>;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: 0, role: 'ai', paragraphs: [intro] }]);
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const chips = questions.filter((q) => !asked.has(norm(q)));

  async function ask(q: string) {
    const question = q.trim();
    if (!question || typing) return;
    setAsked((s) => new Set(s).add(norm(question)));
    setMsgs((m) => [...m, { id: nextId.current++, role: 'me', paragraphs: [question] }]);
    setTyping(true);
    const [a] = await Promise.all([answer(question), new Promise((r) => setTimeout(r, reduce ? 0 : 900))]);
    if (!alive.current) return;
    setMsgs((m) => [...m, { id: nextId.current++, role: 'ai', ...a }]);
    setTyping(false);
  }

  function submit() {
    const v = text;
    setText('');
    void ask(v);
  }

  return (
    <Screen
      back={back}
      scroll={false}
      right={<T w={700} style={{ fontSize: 14, paddingRight: 12 }}>{who}</T>}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <T v="h1" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30 }}>Ask Drift</T>
          <T v="small" style={{ marginTop: 6 }}>{note}</T>
        </View>
        <ScrollView
          ref={scroller}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: !reduce })}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 }}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {msgs.map((m) => (m.role === 'me' ? (
            <View key={m.id} accessible accessibilityLabel={`You asked: ${m.paragraphs[0]}`}
              style={{ alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: c.btn, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontFamily: FONT[400], fontSize: 15, lineHeight: 22, color: c.btnT }}>{m.paragraphs[0]}</Text>
            </View>
          ) : (
            <View key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '90%', backgroundColor: c.surface, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
              {m.paragraphs.map((p, i) => <T key={i} style={{ fontSize: 15, lineHeight: 22 }}>{p}</T>)}
              {m.basis ? <T v="tiny" style={{ fontSize: 12, lineHeight: 17, borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}>{m.basis}</T> : null}
            </View>
          )))}
          {typing && (
            <View accessibilityRole="progressbar" accessibilityLabel="Drift is thinking" style={{ alignSelf: 'flex-start', backgroundColor: c.surface, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 16, flexDirection: 'row', gap: 4 }}>
              {[0, 1, 2].map((i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.t2, opacity: 0.6 }} />)}
            </View>
          )}
        </ScrollView>
        {chips.length > 0 && (
          <ScrollView accessibilityLabel="Suggested questions" style={{ maxHeight: 142, flexGrow: 0 }}
            contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>
            {chips.map((q) => (
              <Pressable key={q} disabled={typing} onPress={() => void ask(q)} accessibilityRole="button"
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: c.line, opacity: typing ? 0.5 : 1 }}>
                <Text style={{ fontFamily: FONT[400], fontSize: 14, color: c.t1 }}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: c.line, backgroundColor: c.bg }}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            placeholder="Ask a question"
            placeholderTextColor={c.t2}
            accessibilityLabel="Ask a question"
            returnKeyType="send"
            style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 18, fontFamily: FONT[400], fontSize: 16, color: c.t1 }}
          />
          <Pressable onPress={submit} disabled={typing || !text.trim()} accessibilityRole="button" accessibilityLabel="Send"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.btn, alignItems: 'center', justifyContent: 'center', opacity: typing || !text.trim() ? 0.5 : 1 }}>
            <Icon name="send" size={20} color={c.btnT} stroke={2.2} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

