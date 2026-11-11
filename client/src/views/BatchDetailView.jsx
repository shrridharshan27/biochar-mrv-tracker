import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBatch, verifyChain, getQrImageUrl } from '../api/batchApi';
import { useToast } from '../context/ToastContext';
import { FeedstockBadge, ChainBadge } from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';

export default function BatchDetailView() {
  const { id } = useParams();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chainValidity, setChainValidity] = useState(null);

  const { showError } = useToast();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch batch details and chain status concurrently
        const [batchData, verifyResult] = await Promise.all([
          getBatch(id),
          verifyChain().catch(() => ({ valid: true, broken_at: null })),
        ]);

        if (isMounted) {
          setBatch(batchData);
          setChainValidity(verifyResult);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load batch record');
          showError(`Failed to load batch: ${err.message}`, { title: 'Not Found' });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (id) {
      loadData();
    }

    return () => {
      isMounted = false;
    };
  }, [id, showError]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <svg className="w-8 h-8 animate-spin text-emerald-600 mx-auto" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="mt-3 text-xs text-slate-500 font-mono">Loading cryptographic block details...</p>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-900">Record Not Found</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          {error || `No cryptographic batch record found with ID ${id}.`}
        </p>
        <div className="mt-5">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg shadow-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isGenesis = batch.prev_hash === '';
  const massYield = batch.mass_in_kg > 0
    ? ((batch.mass_out_kg / batch.mass_in_kg) * 100).toFixed(1)
    : '0.0';

  const qrUrl = getQrImageUrl(batch.id);

  const handleDownloadQr = () => {
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `biochar_batch_${batch.id}_qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isBatchTampered = chainValidity && !chainValidity.valid && chainValidity.broken_at === batch.id;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <nav className="text-xs text-slate-500 mb-1 flex items-center gap-1.5" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-slate-800 transition-colors">Dashboard</Link>
            <span className="text-slate-400">/</span>
            <span className="text-slate-900 font-medium">Batch Record</span>
          </nav>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg font-bold text-slate-900 font-mono">
              Batch {batch.id}
            </h1>
            <FeedstockBadge feedstock={batch.feedstock} />
            {isGenesis && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                Genesis Block
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors"
          >
            ← Dashboard
          </Link>
          <Link
            to="/log"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            + Log Batch
          </Link>
        </div>
      </div>

      {/* Hero Metric Banner: Carbon Sequestration Callout */}
      <div className="bg-white border border-emerald-300 ring-1 ring-emerald-100 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                Certified Atmospheric Carbon Removal
              </p>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold font-mono tabular-nums text-slate-900 tracking-tight">
                {Number(batch.co2_kg).toFixed(2)}
              </span>
              <span className="text-sm font-semibold text-slate-500 font-mono">
                kg CO₂e Sequestered
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Calculated as <span className="font-mono text-slate-700">{batch.mass_out_kg} kg biochar × 0.60 stable C × 3.67 C:CO₂</span>.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <ChainBadge
              valid={!isBatchTampered && (chainValidity ? chainValidity.valid : true)}
              brokenAt={isBatchTampered ? batch.id : null}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Attributes & QR Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Production Attributes (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Telemetry card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              Kiln Production Telemetry
            </h2>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
              <div>
                <dt className="text-slate-500 font-medium">Record Timestamp</dt>
                <dd className="mt-1 font-mono text-slate-900 tabular-nums">
                  {batch.timestamp}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Feedstock Type</dt>
                <dd className="mt-1 text-slate-900 font-medium">
                  {batch.feedstock}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Raw Biomass In</dt>
                <dd className="mt-1 font-mono text-slate-900 text-sm font-semibold tabular-nums">
                  {Number(batch.mass_in_kg).toFixed(2)} <span className="text-xs font-normal text-slate-500">kg</span>
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Net Biochar Produced</dt>
                <dd className="mt-1 font-mono text-slate-900 text-sm font-semibold tabular-nums">
                  {Number(batch.mass_out_kg).toFixed(2)} <span className="text-xs font-normal text-slate-500">kg</span>
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Peak Kiln Temperature</dt>
                <dd className="mt-1 font-mono text-slate-900 text-sm font-semibold tabular-nums">
                  {Number(batch.temp_c).toFixed(1)}°C
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Pyrolysis Mass Yield</dt>
                <dd className="mt-1 font-mono text-emerald-700 text-sm font-semibold tabular-nums">
                  {massYield}%
                </dd>
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <dt className="text-slate-500 font-medium">Operator Notes & Observations</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {batch.notes ? batch.notes : <span className="italic text-slate-400">No batch notes recorded.</span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Cryptographic Audit Trail Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">
                Cryptographic Audit Trail
              </h2>
              <span className="text-[11px] font-mono text-emerald-700 font-medium">
                SHA-256 Chained
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">
                  Current Block Hash (<span className="font-mono">record_hash</span>)
                </p>
                <HashDisplay hash={batch.record_hash} />
                <p className="text-[11px] text-slate-500 mt-1 font-mono">
                  SHA-256 over: id + timestamp + feedstock + mass_in + temp + mass_out + notes + co2 + prev_hash
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-700 mb-1">
                  Preceding Block Hash (<span className="font-mono">prev_hash</span>)
                </p>
                <HashDisplay hash={batch.prev_hash} isGenesis={isGenesis} />
                <p className="text-[11px] text-slate-500 mt-1 font-mono">
                  {isGenesis
                    ? 'Root block: prev_hash is strictly empty string ""'
                    : 'Cryptographic pointer to immediate predecessor record_hash'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Physical Verification QR Code (1 col) */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col items-center text-center">
            <h3 className="text-sm font-semibold text-slate-900">
              Physical Verification QR
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Scannable audit token for physical biochar bag tagging and field inspection.
            </p>

            <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-inner">
              <img
                src={qrUrl}
                alt={`Audit QR Code for batch ${batch.id}`}
                className="w-48 h-48 object-contain"
              />
            </div>

            <div className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-left">
              <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                Encoded JSON
              </p>
              <pre className="text-[11px] font-mono text-slate-800 mt-1 whitespace-pre-wrap break-all">
{JSON.stringify({ id: batch.id, hash: batch.record_hash, app: 'biochar-mrv' }, null, 2)}
              </pre>
            </div>

            <button
              type="button"
              onClick={handleDownloadQr}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download QR Code (PNG)</span>
            </button>
          </div>

          {/* Append-only verification notice */}
          <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-slate-800">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Immutable Ledger Guarantee</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              This record is sealed in an append-only SQLite database. Database UPDATE and DELETE operations are physically barred at both route and storage layers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
