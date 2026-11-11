import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import DashboardView from './views/DashboardView';
import LogBatchView from './views/LogBatchView';
import BatchDetailView from './views/BatchDetailView';

function NotFoundView() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="text-4xl font-mono font-bold text-slate-300">404</p>
      <h1 className="mt-2 text-base font-semibold text-slate-900">Page Not Found</h1>
      <p className="mt-1 text-xs text-slate-500">
        The requested URL does not exist in the Biochar MRV application.
      </p>
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
        >
          ← Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
          <Navbar />

          <main className="flex-1">
            <Routes>
              <Route path="/" element={<DashboardView />} />
              <Route path="/log" element={<LogBatchView />} />
              <Route path="/batch/:id" element={<BatchDetailView />} />
              <Route path="*" element={<NotFoundView />} />
            </Routes>
          </main>

          <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="font-semibold text-slate-800">Varaha Internship Project</span>
                <span className="text-slate-400">•</span>
                <span>Biochar MRV Tracker & Cryptographic Ledger</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                <span>SHA-256 Chained</span>
                <span>•</span>
                <span>Append-Only SQLite</span>
                <span>•</span>
                <span>Pure Tailwind CSS</span>
              </div>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}
