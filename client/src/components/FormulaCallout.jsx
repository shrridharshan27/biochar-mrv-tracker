import React from 'react';

export default function FormulaCallout() {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-xs font-semibold text-slate-900 tracking-wide uppercase">
          MRV Methodology & Formula Assumptions
        </h3>
      </div>

      <div className="text-xs space-y-2 text-slate-600 leading-relaxed">
        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0" />
          <p>
            <strong className="text-slate-800">Stable Carbon Fraction:</strong> Assumes <span className="font-mono font-medium text-slate-800">60%</span> stable carbon retained in biochar (<span className="font-mono text-slate-700">mass_out × 0.60</span>).
          </p>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0" />
          <p>
            <strong className="text-slate-800">Stoichiometric Factor:</strong> Uses C → CO₂ conversion ratio of <span className="font-mono font-medium text-slate-800">3.67</span> (<span className="font-mono text-slate-700">44/12</span> molecular weight equivalent).
          </p>
        </div>

        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
          <p>
            <strong className="text-slate-800">Certification Notice:</strong> Result is an estimate; lab proximate analysis (volatile matter, fixed carbon, H:C ratio) is recommended for formal carbon credit issuance.
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>Formula: CO₂e (kg) = mass_out_kg × 0.60 × 3.67</span>
        <span className="text-emerald-700 font-medium">Server-signed SHA-256</span>
      </div>
    </div>
  );
}
