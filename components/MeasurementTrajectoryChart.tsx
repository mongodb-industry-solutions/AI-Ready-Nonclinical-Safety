'use client';

import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EndpointSummary, OperationalMeasurementSeries } from '@/lib/contracts';
import { useThemeTokens } from '@/lib/useThemeTokens';

const colors = ['#4FE0D5', '#8B7CF6', '#F2B84B', '#F46D94', '#A8BBC1', '#5EA7F7'];

export type MeasurementPointSelection = {
  domain: string;
  testCode: string;
  label: string;
  sourceRecordIds: string[];
};

export default function MeasurementTrajectoryChart({ series, endpoints, height = 300, onSelectPoint }: {
  series: OperationalMeasurementSeries[];
  endpoints: EndpointSummary[];
  height?: number;
  onSelectPoint?: (selection: MeasurementPointSelection) => void;
}) {
  const theme = useThemeTokens();
  const chart = useMemo(() => {
    const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
    const rows = new Map<string, Record<string, unknown>>();
    const lines: string[] = [];
    for (const item of series) {
      item.points.forEach((point, index) => {
        const x = point.studyDay ?? point.group?.dose ?? index;
        const rowKey = String(x);
        if (!rows.has(rowKey)) rows.set(rowKey, { x });
        const endpoint = endpointById.get(point.endpointSummaryId);
        const row = rows.get(rowKey)!;
        const groupIdentity = point.group?.label || (point.group?.dose === undefined ? point.group?.code : `${point.group.dose} ${point.group.unit || ''}`.trim());
        const line = [groupIdentity || item.sex || 'All subjects', item.phase && item.phase !== 'ALL' ? item.phase : ''].filter(Boolean).join(' · ');
        if (!lines.includes(line)) lines.push(line);
        const accumulatorKey = '__aggregate:' + line;
        const accumulator = (row[accumulatorKey] as { weightedTotal: number; count: number; sourceRecordIds: string[] } | undefined) || { weightedTotal: 0, count: 0, sourceRecordIds: [] };
        const count = Math.max(1, point.statistics.count || 0);
        accumulator.weightedTotal += point.statistics.mean * count;
        accumulator.count += count;
        accumulator.sourceRecordIds.push(...(endpoint?.sourceRecordIds || []));
        row[accumulatorKey] = accumulator;
        row[line] = accumulator.weightedTotal / accumulator.count;
        row['__' + line] = [...new Set(accumulator.sourceRecordIds)];
        row['__meta:' + line] = {
          domain: endpoint?.domain || item.domain,
          testCode: endpoint?.testCode || item.testCode,
          label: [item.test, groupIdentity, point.studyDay === undefined ? undefined : `day ${point.studyDay}`].filter(Boolean).join(' · '),
        };
      });
    }
    return { rows: [...rows.values()].sort((a, b) => Number(a.x) - Number(b.x)), lines };
  }, [endpoints, series]);

  if (!theme) return <div className="measurement-trajectory" style={{ height }} aria-hidden="true" />;
  if (!series.length || !chart.rows.length) return <div className="evidence-chart-empty">No materialized trajectory is available for this dimension.</div>;
  const first = series[0];
  function selectPoint(row: Record<string, unknown> | undefined, line: string) {
    if (!row) return;
    const sourceRecordIds = row['__' + line];
    const metadata = row['__meta:' + line] as { domain?: string; testCode?: string; label?: string } | undefined;
    if (Array.isArray(sourceRecordIds) && sourceRecordIds.length) onSelectPoint?.({
      domain: metadata?.domain || first.domain,
      testCode: metadata?.testCode || first.testCode,
      label: metadata?.label || [first.test, line, String(row.x ?? '')].join(' · '),
      sourceRecordIds: sourceRecordIds.map(String),
    });
  }
  return <div className="measurement-trajectory" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chart.rows} margin={{ top: 14, right: 18, bottom: 8, left: 0 }} onClick={(state) => {
        const payload = state?.activePayload?.[0];
        const line = payload?.dataKey ? String(payload.dataKey) : '';
        selectPoint(payload?.payload as Record<string, unknown> | undefined, line);
      }}>
        <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="4 5" />
        <XAxis dataKey="x" tick={{ fill: theme.tick, fontSize: 11 }} axisLine={{ stroke: theme.axis }} tickLine={false} label={{ value: first.points.some((point) => point.studyDay !== undefined) ? 'study day' : 'dose', fill: theme.label, fontSize: 10, position: 'insideBottomRight', offset: -3 }} />
        <YAxis tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={46} label={{ value: first.unit || '', angle: -90, position: 'insideLeft', fill: theme.label, fontSize: 10 }} />
        <Tooltip contentStyle={theme.tooltip} />
        <Legend wrapperStyle={{ color: theme.tick, fontSize: 10 }} />
        {chart.lines.map((line, index) => <Line key={line} type="monotone" dataKey={line} stroke={colors[index % colors.length]} strokeWidth={2.2} dot={(properties) => {
          const point = properties as unknown as { cx?: number; cy?: number; payload?: Record<string, unknown> };
          if (point.cx === undefined || point.cy === undefined) return <g />;
          return <circle cx={point.cx} cy={point.cy} r={3.5} fill={colors[index % colors.length]} stroke={theme.surface} strokeWidth={1.5} className="trajectory-point" onClick={(event) => { event.stopPropagation(); selectPoint(point.payload, line); }} />;
        }} activeDot={{ r: 6, cursor: 'pointer' }} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
