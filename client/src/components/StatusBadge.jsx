import React from 'react';

/**
 * Feedstock and verification status badges
 */
export function FeedstockBadge({ feedstock }) {
  const styles = {
    Wood: 'bg-amber-50 text-amber-800 border-amber-200',
    'Rice Husk': 'bg-yellow-50 text-yellow-800 border-yellow-200',
    'Crop Residue': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Bamboo: 'bg-teal-50 text-teal-800 border-teal-200',
    Other: 'bg-slate-100 text-slate-700 border-slate-200',
  }[feedstock] || 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles}`}>
      {feedstock || 'Unknown'}
    </span>
  );
}

export function ChainBadge({ valid, brokenAt }) {
  if (valid) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>Chain verified intact</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200">
      <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>Integrity break{brokenAt ? ` at ${brokenAt.slice(0, 10)}...` : ''}</span>
    </span>
  );
}
