'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LabSeries } from '@/lib/contracts';
import { useThemeTokens } from '@/lib/useThemeTokens';

export default function LabTrajectoryChart({ series }: { series: LabSeries }) {
  const theme = useThemeTokens();
  // Dose keys are derived from the data rather than hardcoded, so a study with a
  // different group design still renders every treated series.
  const doses = Array.from(new Set(series.points.flatMap((point) => Object.keys(point))))
    .filter((key) => key !== 'day')
    .sort((a, b) => Number(a) - Number(b));
  if (!theme) return <div className="chart-wrap" aria-hidden="true" />;

  return (
    <div className="chart-wrap" aria-label={`${series.label} trajectory chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series.points} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: theme.tick, fontSize: 12 }} tickLine={false} axisLine={{ stroke: theme.axis }} />
          <YAxis tick={{ fill: theme.tick, fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={theme.tooltip} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: theme.tick, paddingTop: 4 }} />
          {doses.map((dose, index) => (
            <Line
              key={dose}
              type="monotone"
              dataKey={dose}
              name={`${dose} mg/kg`}
              stroke={theme.series[index % theme.series.length]}
              strokeWidth={dose === '0' ? 2.5 : 1.8}
              strokeDasharray={dose === '0' ? '5 3' : undefined}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
