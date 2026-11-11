import React from 'react';

export default function MetricCard({ title, value, unit, subtitle, icon, highlight = false, badge }) {
  return (
    <div className={`p-5 rounded-xl border transition-all duration-200 bg-white ${
      highlight ? 'border-emerald-300 ring-1 ring-emerald-100 shadow-sm' : 'border-slate-200 shadow-sm'
    }`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500 tracking-tight uppercase">
          {title}
        </p>
        {icon && (
          <div className={`p-2 rounded-lg ${highlight ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold font-mono tabular-nums tracking-tight ${
          highlight ? 'text-emerald-700' : 'text-slate-900'
        }`}>
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium text-slate-500 font-mono">
            {unit}
          </span>
        )}
      </div>

      {(subtitle || badge) && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          {subtitle && <span>{subtitle}</span>}
          {badge}
        </div>
      )}
    </div>
  );
}
