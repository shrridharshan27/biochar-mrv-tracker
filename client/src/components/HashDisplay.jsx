import React, { useState } from 'react';

export default function HashDisplay({ hash, isGenesis = false, label }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (isGenesis || hash === '') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded text-xs text-slate-600 font-mono">
        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>Genesis Record (Empty)</span>
      </div>
    );
  }

  if (!hash) {
    return <span className="text-slate-400 text-xs italic">None</span>;
  }

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const truncatedHash = `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  return (
    <div className="inline-flex flex-col sm:flex-row sm:items-center gap-1 max-w-full">
      {label && <span className="text-xs text-slate-500 font-medium mr-1">{label}:</span>}
      <div className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 px-2 py-1 rounded text-xs font-mono text-slate-800 transition-colors">
        <span
          className="cursor-pointer select-all break-all"
          title={hash}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? hash : truncatedHash}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-slate-500 hover:text-slate-900 transition-colors p-0.5"
          title="Copy full hash to clipboard"
          aria-label="Copy hash"
        >
          {copied ? (
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
      {copied && (
        <span className="text-[11px] text-emerald-700 font-medium ml-1">Copied</span>
      )}
    </div>
  );
}
