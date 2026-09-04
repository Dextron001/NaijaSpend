import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, LabelList,
} from 'recharts';
import { fmt0, fmtCompact } from '../format.js';

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="chart-tip-row">
          <span className="dot" style={{ background: p.color || p.payload?.color }} />
          <span>{p.name}:</span>&nbsp;<strong>{fmt0(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

export function TrendChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5a524" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f5a524" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1ef" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5f6f66' }} />
        <YAxis tickFormatter={(v) => fmtCompact(v)} tickLine={false} axisLine={false} width={54} tick={{ fontSize: 11, fill: '#5f6f66' }} />
        <Tooltip content={<Tip />} />
        <Area type="monotone" dataKey="income" name="Income" stroke="#16a34a" strokeWidth={2.5} fill="url(#gIncome)" />
        <Area type="monotone" dataKey="expense" name="Spending" stroke="#f5a524" strokeWidth={2.5} fill="url(#gExpense)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 240 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="chart-empty">No spending data for this month yet</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({ data, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1ef" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#5f6f66' }} />
        <YAxis tickFormatter={(v) => fmtCompact(v)} tickLine={false} axisLine={false} width={54} tick={{ fontSize: 11, fill: '#5f6f66' }} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(10,125,67,.06)' }} />
        <Bar dataKey="expense" name="Spending" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.projected ? '#7fbf9d' : '#0a7d43'} />
          ))}
          <LabelList dataKey="expense" position="top" formatter={(v) => fmtCompact(v)} style={{ fontSize: 10, fill: '#5f6f66' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HealthGauge({ score = 0, tier = '', color = '#0a7d43' }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 118" className="gauge">
        <path d="M 18 108 A 82 82 0 0 1 182 108" fill="none" stroke="#e9efeb" strokeWidth="14" strokeLinecap="round" pathLength="100" />
        <path
          d="M 18 108 A 82 82 0 0 1 182 108" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          pathLength="100" strokeDasharray={`${clamped} 100`} style={{ transition: 'stroke-dasharray .8s ease' }}
        />
        <text x="100" y="86" textAnchor="middle" className="gauge-num">{clamped}</text>
        <text x="100" y="107" textAnchor="middle" className="gauge-tier">{tier}</text>
      </svg>
    </div>
  );
}
