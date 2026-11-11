import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBatches, verifyChain, getCsvExportUrl } from '../api/batchApi';
import { useToast } from '../context/ToastContext';
import MetricCard from '../components/MetricCard';
import { FeedstockBadge, ChainBadge } from '../components/StatusBadge';
import QrModal from '../components/QrModal';

export default function DashboardView() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeQrBatch, setActiveQrBatch] = useState(null);
  const [chainStatus, setChainStatus] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const { showSuccess, showError, showInfo } = useToast();

  const loadBatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getBatches();
      setBatches(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch batch ledger');
      showError(`Unable to load batches: ${err.message}`, { title: 'Fetch Error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  // Compute aggregate statistics
  const stats = useMemo(() => {
    const totalBatches = batches.length;
    const totalCO2 = batches.reduce((sum, b) => sum + (Number(b.co2_kg) || 0), 0);
    const totalBiochar = batches.reduce((sum, b) => sum + (Number(b.mass_out_kg) || 0), 0);
    const totalBiomassIn = batches.reduce((sum, b) => sum + (Number(b.mass_in_kg) || 0), 0);
    const avgYield = totalBiomassIn > 0 ? (totalBiochar / totalBiomassIn) * 100 : 0;

    return {
      totalBatches,
      totalCO2: totalCO2.toFixed(2),
      totalBiochar: totalBiochar.toFixed(2),
      avgYield: avgYield.toFixed(1),
    };
  }, [batches]);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await verifyChain();
      setChainStatus(res);
      if (res.valid) {
        showSuccess(`Audit chain intact. All ${batches.length} cryptographic records verified with zero discrepancies.`, {
          title: 'Integrity Check Passed',
        });
      } else {
        showError(`Tamper detected! Cryptographic break identified at batch ID: ${res.broken_at || 'unknown'}`, {
          title: 'Integrity Violation',
        });
      }
    } catch (err) {
      showError(`Chain verification failed: ${err.message}`, { title: 'Verification Error' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportCsv = () => {
    showInfo('Preparing audit ledger CSV export...', { duration: 2500 });
    const csvUrl = getCsvExportUrl();
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = 'biochar_batches_audit_trail.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess('Audit ledger CSV successfully downloaded.', { title: 'Export Complete' });
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toISOString().replace('T', ' ').substring(0, 16);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Biochar MRV Production Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-proof cryptographic record of kiln batches, biomass conversions, and verified carbon removal.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors"
            title="Download full audit log in CSV format"
          >
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            title="Verify entire SHA-256 chain integrity"
          >
            {isVerifying ? (
              <svg className="w-3.5 h-3.5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
            <span>{isVerifying ? 'Checking...' : 'Verify Chain'}</span>
          </button>

          <Link
            to="/log"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Log Batch</span>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Batches"
          value={stats.totalBatches}
          subtitle="Cryptographically sealed"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />

        <MetricCard
          title="CO₂ Sequestered"
          value={stats.totalCO2}
          unit="kg"
          subtitle="Estimated carbon credit yield"
          highlight
          icon={
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <MetricCard
          title="Biochar Output"
          value={stats.totalBiochar}
          unit="kg"
          subtitle={`Avg. mass yield: ${stats.avgYield}%`}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />

        <MetricCard
          title="Chain Status"
          value={chainStatus ? (chainStatus.valid ? 'Intact' : 'Broken') : 'Audited'}
          subtitle="Sequential SHA-256 links"
          badge={
            chainStatus ? (
              <ChainBadge valid={chainStatus.valid} brokenAt={chainStatus.broken_at} />
            ) : (
              <span className="text-[11px] font-mono text-slate-500">Append-only</span>
            )
          }
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          }
        />
      </div>

      {/* Batch Ledger Table Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Audit Trail Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ordered chronologically by timestamp ascending. Each block references its predecessor's SHA-256 hash.
            </p>
          </div>
          <button
            type="button"
            onClick={loadBatches}
            className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 self-start sm:self-auto"
            title="Refresh table data"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <svg className="w-6 h-6 animate-spin text-emerald-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="mt-3 text-xs text-slate-500 font-mono">Loading cryptographic records...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="inline-flex p-2 bg-rose-50 text-rose-600 rounded-full mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-xs font-medium text-slate-900">{error}</p>
            <button
              onClick={loadBatches}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Try again
            </button>
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">No batches in ledger</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Start by logging your first biochar kiln production batch to initialize the genesis block.
            </p>
            <div className="mt-4">
              <Link
                to="/log"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Log Genesis Batch</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-medium">
                <tr>
                  <th scope="col" className="py-3 px-4">Batch ID</th>
                  <th scope="col" className="py-3 px-4">Date & Time</th>
                  <th scope="col" className="py-3 px-4">Feedstock</th>
                  <th scope="col" className="py-3 px-4 text-right">Mass In (kg)</th>
                  <th scope="col" className="py-3 px-4 text-right">Peak Temp</th>
                  <th scope="col" className="py-3 px-4 text-right">Mass Out (kg)</th>
                  <th scope="col" className="py-3 px-4 text-right">Est. CO₂ (kg)</th>
                  <th scope="col" className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {batches.map((batch, index) => {
                  const truncatedId = `${batch.id.slice(0, 8)}...${batch.id.slice(-4)}`;
                  const isGenesis = index === 0;

                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono text-slate-900 whitespace-nowrap">
                        <Link
                          to={`/batch/${batch.id}`}
                          className="hover:text-emerald-700 font-medium underline underline-offset-2 decoration-slate-300 hover:decoration-emerald-500"
                          title={`View batch details: ${batch.id}`}
                        >
                          {truncatedId}
                        </Link>
                        {isGenesis && (
                          <span className="ml-1.5 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            Genesis
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {formatTimestamp(batch.timestamp)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <FeedstockBadge feedstock={batch.feedstock} />
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {Number(batch.mass_in_kg).toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {Number(batch.temp_c).toFixed(1)}°C
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {Number(batch.mass_out_kg).toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                        {Number(batch.co2_kg).toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            to={`/batch/${batch.id}`}
                            className="inline-flex items-center px-2 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                            title="View full record details"
                          >
                            View
                          </Link>

                          <button
                            type="button"
                            onClick={() => setActiveQrBatch(batch)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
                            title="Preview audit verification QR code"
                          >
                            <svg className="w-3 h-3 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            <span>QR</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {activeQrBatch && (
        <QrModal
          batch={activeQrBatch}
          onClose={() => setActiveQrBatch(null)}
        />
      )}
    </div>
  );
}
