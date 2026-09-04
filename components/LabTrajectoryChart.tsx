'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LabSeries } from '@/lib/contracts';

const colors: Record<string, string> = { '0': '#a4b5bc', '4': '#7c6df0', '6': '#24c7bc', '8': '#f2b64b', '12': '#ed6d8f' };

export default function LabTrajectoryChart({ series }: { series: LabSeries }) {
  return (
    <div className="chart-wrap" aria-label={`${series.label} trajectory chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series.points} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="#203139" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: '#76909a', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#273941' }} />
          <YAxis tick={{ fill: '#76909a', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: '#101e24', border: '1px solid #2a4149', borderRadius: 10, fontSize: 11 }} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 9, color: '#8ca0a8' }} />
          {Object.entries(colors).map(([dose, color]) => <Line key={dose} type="monotone" dataKey={dose} name={`${dose} mg/kg`} stroke={color} strokeWidth={dose === '0' ? 2 : 1.5} dot={{ r: 2 }} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
