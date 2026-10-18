// Hand-written responsive SVG line chart (share of viewing per month).

export interface ChartSeries {
  key: string;
  name: string;
  values: number[];
  color: string;
  dash?: boolean;
  /** Thicker line for the highlighted series. */
  emphasis?: boolean;
}

interface Props {
  labels: string[];
  series: ChartSeries[];
  /** Dashed vertical marker at a point index, with a dot on one series. */
  marker?: { index: number; seriesKey?: string };
  ariaLabel: string;
  /** Max number of x-axis labels shown. */
  maxLabels?: number;
}

const W = 350, H = 210, LEFT = 30, RIGHT = 340, TOP = 20, BOTTOM = 180;

/** Rounds the data max up to a step that splits nicely in two (20, 40, 60…). */
export function niceTop(max: number): number {
  if (max <= 10) return 10;
  if (max <= 20) return 20;
  return Math.ceil(max / 20) * 20;
}

/** Evenly spread label indices, always including first and last. */
export function labelIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let k = 0; k < max; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out];
}

export function LineChart({ labels, series, marker, ariaLabel, maxLabels = 6 }: Props) {
  const n = labels.length;
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const top = niceTop(dataMax);
  const x = (i: number) => (n <= 1 ? (LEFT + RIGHT) / 2 : LEFT + (i * (RIGHT - LEFT)) / (n - 1));
  const y = (v: number) => BOTTOM - (Math.max(0, v) / top) * (BOTTOM - TOP);
  const mid = (TOP + BOTTOM) / 2;
  const markSeries = marker ? series.find((s) => s.key === marker.seriesKey) : undefined;
  const markValue = marker && markSeries ? markSeries.values[marker.index] : undefined;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        <g stroke="var(--line)" strokeWidth="1">
          <line x1={LEFT} y1={TOP} x2={RIGHT} y2={TOP} />
          <line x1={LEFT} y1={mid} x2={RIGHT} y2={mid} />
          <line x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} />
        </g>
        <g aria-hidden="true">
          <text x="0" y={TOP + 4}>{top}%</text>
          <text x="0" y={mid + 4}>{top / 2}%</text>
          <text x="12" y={BOTTOM + 4}>0</text>
        </g>
        {marker && marker.index >= 0 && marker.index < n && (
          <line x1={x(marker.index)} y1={TOP} x2={x(marker.index)} y2={BOTTOM} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {series.map((s) => (
          n === 1 ? (
            <circle key={s.key} cx={x(0)} cy={y(s.values[0] ?? 0)} r="3.5" fill={s.color} />
          ) : (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasis ? 3 : 2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash ? '5 4' : undefined}
              points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
            />
          )
        ))}
        {marker && markValue !== undefined && (
          <circle cx={x(marker.index)} cy={y(markValue)} r="5" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2.5" />
        )}
        <g textAnchor="middle" aria-hidden="true">
          {labelIndices(n, maxLabels).map((i) => <text key={i} x={x(i)} y="202">{labels[i]}</text>)}
        </g>
      </svg>
      <figcaption className="legend">
        {series.map((s) => (
          <span key={s.key}><i className={s.dash ? 'dash' : undefined} style={{ background: s.color, color: s.color }} />{s.name}</span>
        ))}
      </figcaption>
    </figure>
  );
}
