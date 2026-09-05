'use client';

import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DoseGroup, SafetySignal } from '@/lib/contracts';
import { useThemeTokens } from '@/lib/useThemeTokens';

export default function DoseResponseChart({ signal, groups }: { signal: SafetySignal; groups: DoseGroup[] }) {
  const theme = useThemeTokens();
  const data = groups.map((group, index) => ({
    dose: group.dose,
    affected: signal.incidence[index] || 0,
    rate: Math.round(((signal.incidence[index] || 0) / group.animalCount) * 100),
    control: group.dose === 0,
  }));
  if (!theme) return <div className="chart-wrap" aria-hidden="true" />;

  return (
    <div className="chart-wrap" aria-label="Dose response chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="doseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.accent} />
              <stop offset="100%" stopColor={theme.accentDeep} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="dose" tick={{ fill: theme.tick, fontSize: 12 }} axisLine={{ stroke: theme.axis }} tickLine={false} label={{ value: 'mg/kg', position: 'insideBottomRight', fill: theme.label, fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fill: theme.tick, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
          <Tooltip cursor={{ fill: theme.grid, fillOpacity: .35 }} contentStyle={theme.tooltip} formatter={(value) => [`${value}%`, 'Incidence']} />
          {/* The control group is held neutral so a treated-only pattern is visible at a glance. */}
          <Bar dataKey="rate" radius={[7, 7, 2, 2]} maxBarSize={48}>
            {data.map((row) => <Cell key={row.dose} fill={row.control ? theme.control : 'url(#doseGradient)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
