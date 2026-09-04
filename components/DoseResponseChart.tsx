'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DoseGroup, SafetySignal } from '@/lib/contracts';

export default function DoseResponseChart({ signal, groups }: { signal: SafetySignal; groups: DoseGroup[] }) {
  const data = groups.map((group, index) => ({
    dose: group.dose,
    affected: signal.incidence[index] || 0,
    rate: Math.round(((signal.incidence[index] || 0) / group.animalCount) * 100),
  }));
  return (
    <div className="chart-wrap" aria-label="Dose response chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="doseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#55e7dc" />
              <stop offset="100%" stopColor="#168b96" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#203139" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="dose" tick={{ fill: '#76909a', fontSize: 10 }} axisLine={{ stroke: '#273941' }} tickLine={false} label={{ value: 'mg/kg', position: 'insideBottomRight', fill: '#60757e', fontSize: 9 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#76909a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
          <Tooltip contentStyle={{ background: '#101e24', border: '1px solid #2a4149', borderRadius: 10, fontSize: 11 }} formatter={(value) => [`${value}%`, 'Incidence']} />
          <Bar dataKey="rate" fill="url(#doseGradient)" radius={[7, 7, 2, 2]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
