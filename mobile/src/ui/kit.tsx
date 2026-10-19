// Native building blocks in the wireframe's style (src/app/globals.css): 18px-radius cards, pill
// buttons, segmented controls, switches, list rows, sheets and toasts.
import {
  Children, createContext, Fragment, useCallback, useContext, useEffect, useRef, useState,
  type ComponentProps, type ReactNode,
} from 'react';
import {
  AccessibilityInfo, Animated, Linking, Modal, Platform, Pressable, ScrollView, Switch, Text,
  View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
export { Icon };
import { FONT, useTheme } from './theme';

// ── Motion + navigation helpers ─────────────────────────

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}

export function useGo() {
  const router = useRouter();
  return useCallback((href: string) => router.push(href as never), [router]);
}

export function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

// ── Text ────────────────────────────────────────────────

type Variant = 'h1' | 'h2' | 'sub' | 'small' | 'tiny' | 'body' | 'b15' | 'b16' | 'b17' | 'label' | 'stat' | 'big';
const VARIANTS: Record<Variant, { size: number; lh: number; w: 400 | 500 | 700; ls?: number; tone: 't1' | 't2' }> = {
  h1: { size: 28, lh: 34, w: 700, ls: -0.4, tone: 't1' },
  h2: { size: 17, lh: 24, w: 700, tone: 't1' },
  sub: { size: 16, lh: 24, w: 400, tone: 't2' },
  small: { size: 14, lh: 20, w: 400, tone: 't2' },
  tiny: { size: 13, lh: 18, w: 400, tone: 't2' },
  body: { size: 16, lh: 24, w: 400, tone: 't1' },
  b15: { size: 15, lh: 21, w: 700, tone: 't1' },
  b16: { size: 16, lh: 22, w: 700, tone: 't1' },
  b17: { size: 17, lh: 23, w: 700, tone: 't1' },
  label: { size: 13, lh: 18, w: 700, tone: 't2' },
  stat: { size: 22, lh: 28, w: 700, tone: 't1' },
  big: { size: 34, lh: 40, w: 700, tone: 't1' },
};

export function T({ v = 'body', color, w, style, children, ...rest }: ComponentProps<typeof Text> & { v?: Variant; color?: string; w?: 400 | 500 | 700 }) {
  const { c } = useTheme();
  const d = VARIANTS[v];
  return (
    <Text
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[{ fontFamily: FONT[w ?? d.w], fontSize: d.size, lineHeight: d.lh, color: color ?? c[d.tone], letterSpacing: d.ls }, style]}
    >
      {children}
    </Text>
  );
}

/** Bold inline text inside a T. */
export function B({ children, color }: { children: ReactNode; color?: string }) {
  const { c } = useTheme();
  return <Text style={{ fontFamily: FONT[700], color: color ?? c.t1 }}>{children}</Text>;
}

/** Renders **bold** segments. */
export function RichText({ text, v = 'body' }: { text: string; v?: Variant }) {
  const { c } = useTheme();
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <T v={v}>
      {parts.map((p, i) => (i % 2 ? <Text key={i} style={{ fontFamily: FONT[700], color: c.t1 }}>{p}</Text> : <Fragment key={i}>{p}</Fragment>))}
    </T>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T v="h1" accessibilityRole="header" style={style}>{children}</T>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T v="h2" accessibilityRole="header" style={[{ marginTop: 6 }, style]}>{children}</T>;
}
export function GroupLabel({ children }: { children: ReactNode }) {
  return <T v="label" accessibilityRole="header" style={{ marginTop: 8, marginBottom: -6, marginLeft: 4 }}>{children}</T>;
}

// ── Screen ──────────────────────────────────────────────

export function Screen({
  children, back, right, tabbed, scroll = true, footer, contentStyle, closeButton,
}: {
  children: ReactNode;
  /** Fallback route when there is no history to go back to. Shows the back button. */
  back?: string;
  right?: ReactNode;
  tabbed?: boolean;
  scroll?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  closeButton?: boolean;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace((back ?? '/home') as never);
  };
  const header = back !== undefined || right ? (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 6 }}>
      {back !== undefined ? (
        <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={closeButton ? 'Close' : 'Back'} hitSlop={6}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={closeButton ? 'close' : 'back'} size={24} />
        </Pressable>
      ) : <View />}
      {right}
    </View>
  ) : null;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[{ padding: 20, paddingTop: header ? 4 : 20, paddingBottom: 28, gap: 14, flexGrow: 1 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaView edges={tabbed ? ['top'] : ['top', 'bottom']} style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {header}
        {body}
        {footer}
      </SafeAreaView>
    </View>
  );
}

// ── Surfaces ────────────────────────────────────────────

export function Card({ children, style, onPress, href, label }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; href?: string; label?: string;
}) {
  const { c } = useTheme();
  const go = useGo();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: 18, padding: 16, gap: 10 };
  const press = onPress ?? (href ? () => go(href) : undefined);
  if (press) {
    return <Pressable onPress={press} accessibilityRole={href ? 'link' : 'button'} accessibilityLabel={label} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Outline({ children, style, onPress, href, label }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; href?: string; label?: string;
}) {
  const { c } = useTheme();
  const go = useGo();
  const base: ViewStyle = { borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16, gap: 10 };
  const press = onPress ?? (href ? () => go(href) : undefined);
  if (press) {
    return <Pressable onPress={press} accessibilityRole={href ? 'link' : 'button'} accessibilityLabel={label} style={({ pressed }) => [base, style, pressed && { backgroundColor: c.surface }]}>{children}</Pressable>;
  }
  return <View style={[base, style]}>{children}</View>;
}

export function List({ children, nativeID }: { children: ReactNode; nativeID?: string }) {
  const { c } = useTheme();
  const items = Children.toArray(children);
  return (
    <View nativeID={nativeID} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 18, overflow: 'hidden' }}>
      {items.map((ch, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderColor: c.line } : undefined}>{ch}</View>
      ))}
    </View>
  );
}

export function Row({ children, onPress, href, label, topAlign, chev, ext }: {
  children: ReactNode; onPress?: () => void; href?: string; label?: string; topAlign?: boolean; chev?: boolean; ext?: boolean;
}) {
  const { c } = useTheme();
  const go = useGo();
  const press = onPress ?? (href ? () => go(href) : undefined);
  const inner = (
    <>
      {children}
      {chev && <Icon name="chev" size={18} />}
      {ext && <Icon name="external" size={18} color={c.t2} />}
    </>
  );
  const style: ViewStyle = { flexDirection: 'row', alignItems: topAlign ? 'flex-start' : 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 };
  if (press) {
    return <Pressable onPress={press} accessibilityRole={href ? 'link' : 'button'} accessibilityLabel={label} style={({ pressed }) => [style, pressed && { backgroundColor: c.surface }]}>{inner}</Pressable>;
  }
  return <View style={style}>{inner}</View>;
}

/** Title + detail column inside a Row. */
export function Grow({ title, detail, tiny = true, titleSize = 15 }: { title: ReactNode; detail?: ReactNode; tiny?: boolean; titleSize?: number }) {
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
      <T v={titleSize === 15 ? 'b15' : 'b16'}>{title}</T>
      {detail ? <T v={tiny ? 'tiny' : 'small'}>{detail}</T> : null}
    </View>
  );
}

export function KV({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <T style={{ fontSize: 15, flexShrink: 1 }}>{left}</T>
      <T w={700} style={{ fontSize: 15 }}>{right}</T>
    </View>
  );
}

export function Split({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'flex-start' }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: align, gap: 10 }}>{children}</View>;
}

// ── Buttons ─────────────────────────────────────────────

type BtnKind = 'primary' | 'secondary' | 'line' | 'danger' | 'dangerSolid' | 'text';

export function Btn({ children, onPress, href, kind = 'primary', disabled, icon, label, ext, large }: {
  children: ReactNode; onPress?: () => void; href?: string; kind?: BtnKind; disabled?: boolean; icon?: IconName; label?: string; ext?: boolean; large?: boolean;
}) {
  const { c } = useTheme();
  const go = useGo();
  const palette: Record<BtnKind, { bg: string; fg: string; border?: string; h: number; size: number }> = {
    primary: { bg: c.btn, fg: c.btnT, h: 54, size: 17 },
    secondary: { bg: c.surface, fg: c.t1, h: 50, size: 16 },
    line: { bg: 'transparent', fg: c.t1, border: c.t1, h: 50, size: 16 },
    danger: { bg: 'transparent', fg: c.red, border: c.red, h: 50, size: 16 },
    dangerSolid: { bg: c.red, fg: c.bg, h: 50, size: 16 },
    text: { bg: 'transparent', fg: c.t1, h: 46, size: 16 },
  };
  const p = palette[kind];
  const press = onPress ?? (href ? () => go(href) : undefined);
  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        minHeight: large ? 54 : p.h, paddingHorizontal: 20, borderRadius: 999, backgroundColor: p.bg,
        borderWidth: p.border ? 1.5 : 0, borderColor: p.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1, width: '100%',
      })}
    >
      {icon && <Icon name={icon} size={20} color={p.fg} />}
      <Text style={{ fontFamily: FONT[kind === 'text' ? 500 : 700], fontSize: p.size, color: p.fg, textAlign: 'center', flexShrink: 1 }}>{children}</Text>
      {ext && <Icon name="external" size={18} color={p.fg} />}
    </Pressable>
  );
}

export function BtnSm({ children, onPress, href, ghost, label }: { children: ReactNode; onPress?: () => void; href?: string; ghost?: boolean; label?: string }) {
  const { c } = useTheme();
  const go = useGo();
  const press = onPress ?? (href ? () => go(href) : undefined);
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={label}
      style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? c.surface : c.btn }}>
      <Text style={{ fontFamily: FONT[700], fontSize: 14, color: ghost ? c.t1 : c.btnT }}>{children}</Text>
    </Pressable>
  );
}

export function Bottom({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: 'auto', gap: 10, paddingTop: 12 }}>{children}</View>;
}

// ── Controls ────────────────────────────────────────────

export function Seg<V extends string>({ label, options, value, onChange }: {
  label: string; options: { value: V; label: string; icon?: IconName }[]; value: V | null; onChange(v: V): void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: c.surface }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={o.label}
            style={{
              flex: 1, minWidth: 0, height: 40, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: on ? c.bg : 'transparent',
              ...(on ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null),
            }}
          >
            {o.icon && <Icon name={o.icon} size={16} color={on ? c.t1 : c.t2} />}
            <Text numberOfLines={1} style={{ fontFamily: FONT[on ? 700 : 500], fontSize: 14, color: on ? c.t1 : c.t2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onValueChange, disabled, label }: { value: boolean; onValueChange(v: boolean): void; disabled?: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ false: c.swOff, true: c.accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={c.swOff}
      style={{ opacity: disabled ? 0.55 : 1 }}
    />
  );
}

export function SwitchRow({ title, detail, checked, onChange, disabled }: { title: string; detail?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <Row onPress={disabled ? undefined : () => onChange(!checked)} label={title}>
      <Grow title={title} detail={detail} />
      <Toggle value={checked} onValueChange={onChange} disabled={disabled} label={title} />
    </Row>
  );
}

export function Choice({ title, detail, checked, onPress }: { title: string; detail: string; checked: boolean; onPress(): void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: checked, checked }}
      style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: checked ? 15.5 : 16, borderRadius: 18, borderWidth: checked ? 2 : 1.5, borderColor: checked ? c.t1 : c.line }}
    >
      <Radio on={checked} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="b17">{title}</T>
        <T v="small">{detail}</T>
      </View>
    </Pressable>
  );
}

export function Radio({ on }: { on: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.accent : c.mutedLine, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />}
    </View>
  );
}

export function Disclosure({ open, onPress, children }: { open: boolean; onPress(): void; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: FONT[700], fontSize: 15, color: c.t1 }}>{children}</Text>
      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="down" size={16} /></View>
    </Pressable>
  );
}

// ── Small pieces ────────────────────────────────────────

export function Tag({ kind, children }: { kind: 'served' | 'chosen' | 'amber' | 'plain'; children: ReactNode }) {
  const { c } = useTheme();
  const map = {
    served: [c.accentS, c.accentT], chosen: [c.btn, c.btnT], amber: [c.amberS, c.amber], plain: [c.surface, c.t1],
  } as const;
  const [bg, fg] = map[kind];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontFamily: FONT[700], fontSize: 12, color: fg }}>{children}</Text>
    </View>
  );
}

export function PreviewTag() {
  const { c } = useTheme();
  return (
    <Text style={{ fontFamily: FONT[700], fontSize: 12, color: c.t2 }}>PREVIEW  </Text>
  );
}

export function Chips({ items }: { items: { name: string; match?: boolean }[] }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((i) => (
        <View key={i.name} accessible accessibilityLabel={i.match ? `${i.name}, matches your viewing` : i.name}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: i.match ? c.accentS : c.surface }}>
          <Text style={{ fontFamily: FONT[i.match ? 700 : 400], fontSize: 14, color: i.match ? c.accentT : c.t1 }}>{i.name}</Text>
        </View>
      ))}
    </View>
  );
}

export function Avatar({ text, kind = 'you', size = 44 }: { text: string; kind?: 'you' | 'sam' | 'maya' | 'leo' | 'ai'; size?: number }) {
  const { c } = useTheme();
  const map = {
    you: { bg: c.btn, fg: c.btnT }, sam: { bg: c.accentS, fg: c.accentT }, maya: { bg: c.amberS, fg: c.amber },
    leo: { bg: 'transparent', fg: c.t2, border: c.mutedLine }, ai: { bg: c.accentS, fg: c.accent },
  } as const;
  const m = map[kind] as { bg: string; fg: string; border?: string };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center', borderWidth: m.border ? 1.5 : 0, borderColor: m.border, borderStyle: m.border ? 'dashed' : 'solid' }}>
      {kind === 'ai' ? <Icon name="sparkle" size={20} color={c.accent} /> : <Text style={{ fontFamily: FONT[700], fontSize: text.length > 2 ? 13 : 15, color: m.fg }}>{text}</Text>}
    </View>
  );
}

export function Mono({ text, off, size = 40 }: { text: string; off?: boolean; size?: number }) {
  const { c } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT[700], fontSize: size > 36 ? 16 : 14, color: off ? c.t2 : c.t1 }}>{text}</Text>
    </View>
  );
}

export function Insights({ lines }: { lines: string[] }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {lines.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 8 }} />
          <T style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{l}</T>
        </View>
      ))}
    </View>
  );
}

export function Note({ icon = 'info', children, tone = 'outline' }: { icon?: IconName; children: ReactNode; tone?: 'outline' | 'card' | 'amber' }) {
  const { c } = useTheme();
  const style: ViewStyle = tone === 'outline'
    ? { borderWidth: 1, borderColor: c.line }
    : { backgroundColor: tone === 'amber' ? c.amberS : c.surface };
  return (
    <View style={[{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 18, padding: 16 }, style]}>
      <View style={{ marginTop: 1 }}><Icon name={icon} size={18} color={tone === 'amber' ? c.amber : c.t2} /></View>
      <T v="small" style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

export function Banner({ children, href }: { children: ReactNode; href?: string }) {
  const { c } = useTheme();
  const go = useGo();
  const inner = (
    <>
      <Icon name="info" size={18} color={c.accentT} />
      <T v="small" color={c.accentT} style={{ flex: 1 }}>{children}</T>
      {href && <Icon name="chev" size={16} color={c.accentT} />}
    </>
  );
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: c.accentS };
  return href
    ? <Pressable onPress={() => go(href)} accessibilityRole="link" style={style}>{inner}</Pressable>
    : <View style={style}>{inner}</View>;
}

export function SampleBanner() {
  return <Banner href="/connect">Sample data. Upload your export to see your own feed.</Banner>;
}

export function Loading({ blocks = [120, 64, 96] }: { blocks?: number[] }) {
  const { c } = useTheme();
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ gap: 14 }}>
      {blocks.map((h, i) => <View key={i} style={{ height: h, borderRadius: 18, backgroundColor: c.surface }} />)}
    </View>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <Card>
      <T v="b16">{title}</T>
      <T v="small">{children}</T>
      {action && <Btn kind="secondary" href={action.href}>{action.label}</Btn>}
    </Card>
  );
}

export function ErrorCard({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ borderWidth: 1.5, borderColor: c.red, borderRadius: 18, padding: 16, gap: 8 }}>
      <T v="b15" color={c.red}>{title}</T>
      {children}
    </View>
  );
}

// ── Chosen vs served ────────────────────────────────────

export function ChosenBar({ chosenPct, size = 10 }: { chosenPct: number; size?: number }) {
  const { c } = useTheme();
  const v = Math.max(0, Math.min(100, chosenPct));
  return (
    <View
      accessible accessibilityRole="image" accessibilityLabel={`${Math.round(v)}% chosen, ${Math.round(100 - v)}% served`}
      style={{ height: size, borderRadius: 999, overflow: 'hidden', backgroundColor: c.served, flexDirection: 'row' }}
    >
      <View style={{ width: `${v}%`, backgroundColor: c.t1 }} />
    </View>
  );
}

export function PlatformChosen({ name, pct }: { name: string; pct: number }) {
  return (
    <View style={{ gap: 6 }}>
      <KV left={<T w={700} style={{ fontSize: 16 }}>{name}</T>} right={<T v="small" w={400}>{Math.round(pct)}% chosen</T>} />
      <ChosenBar chosenPct={pct} size={8} />
    </View>
  );
}

export function ChosenSummary({ chosenPct, children }: { chosenPct: number; children?: ReactNode }) {
  const { c } = useTheme();
  const n = Math.round(chosenPct);
  return (
    <Card style={{ padding: 18, gap: 12 }}>
      <Split align="flex-start">
        <View><T v="big">{n}%</T><T v="small">Chosen</T></View>
        <View style={{ alignItems: 'flex-end' }}><T v="big" color={c.accentT}>{100 - n}%</T><T v="small">Served</T></View>
      </Split>
      <ChosenBar chosenPct={n} size={12} />
      {children}
    </Card>
  );
}

export function Meter({ fraction, label }: { fraction: number; label: string }) {
  const { c } = useTheme();
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 8, borderRadius: 999, backgroundColor: c.surface, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: c.accent }} />
    </View>
  );
}

export function NavCard({ href, title, children, variant = 'outline' }: { href: string; title: ReactNode; children?: ReactNode; variant?: 'outline' | 'card' }) {
  const Box = variant === 'card' ? Card : Outline;
  return (
    <Box href={href}>
      <Split><T v="b16" style={{ flex: 1 }}>{title}</T><Icon name="chev" size={18} /></Split>
      {children}
    </Box>
  );
}

export function ExternalRow({ href, title, detail }: { href: string; title: string; detail?: string }) {
  return (
    <Row onPress={() => openUrl(href)} label={`${title}, opens in your browser`} ext>
      <Grow title={title} detail={detail} />
    </Row>
  );
}

// ── Sheet + toast ───────────────────────────────────────

export function Sheet({ open, onClose, title, children, alert }: { open: boolean; onClose(): void; title: string; children: ReactNode; alert?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  return (
    <Modal visible={open} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View
          accessibilityViewIsModal
          accessibilityRole={alert ? 'alert' : undefined}
          style={{ backgroundColor: c.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' }}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: 28 + insets.bottom, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, alignSelf: 'center', marginBottom: 4 }} />
            <T v="h1" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>{title}</T>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string) => {
    setMsg(m);
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(m);
    Animated.timing(opacity, { toValue: 1, duration: reduce ? 0 : 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: reduce ? 0 : 200, useNativeDriver: true }).start(() => setMsg(null));
    }, 3200);
  }, [opacity, reduce]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg !== null && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: 20, right: 20, bottom: 96 + insets.bottom, opacity, alignItems: 'center' }}
        >
          <View style={{ backgroundColor: c.btn, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, maxWidth: 480, width: '100%' }}>
            <Text style={{ fontFamily: FONT[500], fontSize: 15, lineHeight: 21, color: c.btnT }}>{msg}</Text>
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}
