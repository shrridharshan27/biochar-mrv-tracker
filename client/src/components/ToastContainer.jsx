import React from 'react';
import { Link } from 'react-router-dom';

function ToastIcon({ type }) {
  if (type === 'success') {
    return (
      <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-sky-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full px-4 sm:px-0 pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const borderColors = {
          success: 'border-l-4 border-l-emerald-600 border-slate-200',
          error: 'border-l-4 border-l-rose-600 border-slate-200',
          warning: 'border-l-4 border-l-amber-600 border-slate-200',
          info: 'border-l-4 border-l-sky-600 border-slate-200',
        }[toast.type] || 'border-l-4 border-l-slate-600 border-slate-200';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto bg-white border ${borderColors} rounded-lg shadow-lg p-3.5 transition-all duration-200 flex items-start gap-3`}
            role="alert"
          >
            <div className="pt-0.5">
              <ToastIcon type={toast.type} />
            </div>
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="text-xs font-semibold text-slate-900 tracking-tight mb-0.5">
                  {toast.title}
                </p>
              )}
              <p className="text-xs text-slate-700 leading-relaxed break-words">
                {toast.message}
              </p>
              {toast.link && (
                <div className="mt-2">
                  <Link
                    to={toast.link.url}
                    onClick={() => onDismiss(toast.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                  >
                    <span>{toast.link.label}</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
