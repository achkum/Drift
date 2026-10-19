// react-native-svg line chart: share of viewing per month, same geometry as the web chart.
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { T } from './kit';
import { useTheme } from './theme';

export interface ChartSeries {
  key: string;
  name: string;
  values: number[];
  color: string;
  dash?: boolean;
  emphasis?: boolean;
}

const W = 350, H = 210, LEFT = 30, RIGHT = 340, TOP = 20, BOTTOM = 180;

export function niceTop(max: number): number {
  if (max <= 10) return 10;
  if (max <= 20) return 20;
  return Math.ceil(max / 20) * 20;
}

export function labelIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let k = 0; k < max; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out];
}

export function LineChart({ labels, series, marker, ariaLabel, maxLabels = 6 }: {
  labels: string[];
  series: ChartSeries[];
  marker?: { index: number; seriesKey?: string };
  ariaLabel: string;
  maxLabels?: number;
}) {
  const { c } = useTheme();
  const n = labels.length;
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const top = niceTop(dataMax);
  const x = (i: number) => (n <= 1 ? (LEFT + RIGHT) / 2 : LEFT + (i * (RIGHT - LEFT)) / (n - 1));
  const y = (v: number) => BOTTOM - (Math.max(0, v) / top) * (BOTTOM - TOP);
  const mid = (TOP + BOTTOM) / 2;
  const markSeries = marker ? series.find((s) => s.key === marker.seriesKey) : undefined;
  const markValue = marker && markSeries ? markSeries.values[marker.index] : undefined;
  const txt = { fontSize: 11, fill: c.t2 } as const;

  return (
    <View style={{ gap: 10 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={ariaLabel}>
        <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
          <G stroke={c.line} strokeWidth={1}>
            <Line x1={LEFT} y1={TOP} x2={RIGHT} y2={TOP} />
            <Line x1={LEFT} y1={mid} x2={RIGHT} y2={mid} />
            <Line x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} />
          </G>
          <SvgText x={0} y={TOP + 4} {...txt}>{`${top}%`}</SvgText>
          <SvgText x={0} y={mid + 4} {...txt}>{`${top / 2}%`}</SvgText>
          <SvgText x={12} y={BOTTOM + 4} {...txt}>0</SvgText>
          {marker && marker.index >= 0 && marker.index < n && (
            <Line x1={x(marker.index)} y1={TOP} x2={x(marker.index)} y2={BOTTOM} stroke={c.accent} strokeWidth={1} strokeDasharray="3 3" />
          )}
          {series.map((s) => (n === 1 ? (
            <Circle key={s.key} cx={x(0)} cy={y(s.values[0] ?? 0)} r={3.5} fill={s.color} />
          ) : (
            <Polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasis ? 3 : 2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash ? '5 4' : undefined}
              points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
            />
          )))}
          {marker && markValue !== undefined && (
            <Circle cx={x(marker.index)} cy={y(markValue)} r={5} fill={c.bg} stroke={c.accent} strokeWidth={2.5} />
          )}
          {labelIndices(n, maxLabels).map((i) => (
            <SvgText key={i} x={x(i)} y={202} textAnchor="middle" {...txt}>{labels[i]}</SvgText>
          ))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, columnGap: 16 }}>
        {series.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Svg width={14} height={4} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Line x1={0} y1={2} x2={14} y2={2} stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeDasharray={s.dash ? '4 3' : undefined} />
            </Svg>
            <T v="tiny">{s.name}</T>
          </View>
        ))}
        {marker && markValue !== undefined && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Svg width={14} height={14} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Circle cx={7} cy={7} r={4.5} fill={c.bg} stroke={c.accent} strokeWidth={2} />
            </Svg>
            <T v="tiny">Turning point</T>
          </View>
        )}
      </View>
    </View>
  );
}
