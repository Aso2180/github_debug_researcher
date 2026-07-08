import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b'];

export default function LanguagePieChart({ languages }) {
  if (!languages || languages.length === 0) {
    return <p style={{ color: '#475569', padding: 16 }}>データなし</p>;
  }

  const total = languages.reduce((s, l) => s + (l.byte_size || 0), 0);
  const data = languages
    .map((l) => ({ name: l.language, value: l.byte_size || 0 }))
    .sort((a, b) => b.value - a.value);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          formatter={(val) => [`${((val / total) * 100).toFixed(1)}%`, '']}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
          formatter={(val) => val}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
