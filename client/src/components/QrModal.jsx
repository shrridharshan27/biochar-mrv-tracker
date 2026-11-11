import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getQrImageUrl } from '../api/batchApi';

export default function QrModal({ batch, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!batch) return null;

  const qrUrl = getQrImageUrl(batch.id);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `biochar_batch_${batch.id}_qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 id="qr-modal-title" className="text-sm font-semibold text-slate-900">
              Audit Verification QR Code
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Batch {batch.id.slice(0, 10)}...
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center">
          <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-inner">
            <img
              src={qrUrl}
              alt={`QR Code for batch ${batch.id}`}
              className="w-48 h-48 object-contain"
            />
          </div>

          <div className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-left">
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Payload schema</p>
            <pre className="text-xs font-mono text-slate-700 mt-1 whitespace-pre-wrap break-all">
{JSON.stringify({ id: batch.id, hash: `${batch.record_hash.slice(0, 16)}...`, app: 'biochar-mrv' }, null, 2)}
            </pre>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
          >
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Download PNG</span>
          </button>

          <Link
            to={`/batch/${batch.id}`}
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <span>View Record</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
