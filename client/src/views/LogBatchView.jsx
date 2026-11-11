import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createBatch } from '../api/batchApi';
import { useToast } from '../context/ToastContext';
import FormulaCallout from '../components/FormulaCallout';

const FEEDSTOCK_OPTIONS = [
  'Wood',
  'Rice Husk',
  'Crop Residue',
  'Bamboo',
  'Other',
];

export default function LogBatchView() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [formData, setFormData] = useState({
    feedstock: 'Crop Residue',
    mass_in_kg: '',
    temp_c: '',
    mass_out_kg: '',
    notes: '',
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Dynamic preview calculation: mass_out * 0.60 * 3.67
  const estimatedCO2 = useMemo(() => {
    const massOut = parseFloat(formData.mass_out_kg);
    if (!isNaN(massOut) && massOut > 0) {
      return (massOut * 0.60 * 3.67).toFixed(2);
    }
    return '0.00';
  }, [formData.mass_out_kg]);

  // Mass balance check: mass_out should not exceed mass_in
  const massBalanceWarning = useMemo(() => {
    const massIn = parseFloat(formData.mass_in_kg);
    const massOut = parseFloat(formData.mass_out_kg);
    if (!isNaN(massIn) && !isNaN(massOut) && massIn > 0 && massOut > 0) {
      if (massOut > massIn) {
        return 'Mass out exceeds mass in. In pyrolysis, biochar yield is typically 20-35% of dry biomass input.';
      }
    }
    return null;
  }, [formData.mass_in_kg, formData.mass_out_kg]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field-specific error
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.feedstock) {
      newErrors.feedstock = 'Feedstock selection is required.';
    } else if (!FEEDSTOCK_OPTIONS.includes(formData.feedstock)) {
      newErrors.feedstock = 'Please select a valid feedstock choice.';
    }

    const massIn = parseFloat(formData.mass_in_kg);
    if (isNaN(massIn) || massIn <= 0) {
      newErrors.mass_in_kg = 'Mass in must be a positive number (kg).';
    }

    const temp = parseFloat(formData.temp_c);
    if (isNaN(temp) || temp <= 0) {
      newErrors.temp_c = 'Peak temperature must be a positive number (°C).';
    } else if (temp < 100 || temp > 1200) {
      newErrors.temp_c = 'Typical pyrolysis temperature ranges between 350°C and 900°C.';
    }

    const massOut = parseFloat(formData.mass_out_kg);
    if (isNaN(massOut) || massOut <= 0) {
      newErrors.mass_out_kg = 'Mass out must be a positive number (kg).';
    }

    if (massIn > 0 && massOut > 0 && massOut > massIn) {
      newErrors.mass_out_kg = 'Biochar mass out cannot exceed raw biomass mass in.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        feedstock: formData.feedstock,
        mass_in_kg: parseFloat(formData.mass_in_kg),
        temp_c: parseFloat(formData.temp_c),
        mass_out_kg: parseFloat(formData.mass_out_kg),
        notes: formData.notes.trim(),
      };

      const result = await createBatch(payload);

      showSuccess(
        `Batch ${result.id.slice(0, 8)}... created! Estimated ~${Number(result.co2_kg).toFixed(2)} kg CO₂e sequestered.`,
        {
          title: 'Batch Sealed & Signed',
          link: {
            label: 'View Batch & QR Code →',
            url: `/batch/${result.id}`,
          },
          duration: 7000,
        }
      );

      // Navigate to detail view
      navigate(`/batch/${result.id}`);
    } catch (err) {
      showError(err.message || 'Failed to seal batch record', {
        title: 'Submission Error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Breadcrumb */}
      <div>
        <nav className="text-xs text-slate-500 mb-2 flex items-center gap-1.5" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-slate-800 transition-colors">Dashboard</Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-900 font-medium">Log Kiln Batch</span>
        </nav>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Log Production Batch
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Record kiln telemetry to seal an immutable block in the SHA-256 audit ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
            {/* Feedstock Dropdown */}
            <div>
              <label htmlFor="feedstock" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Feedstock Material <span className="text-rose-500">*</span>
              </label>
              <select
                id="feedstock"
                name="feedstock"
                value={formData.feedstock}
                onChange={handleChange}
                className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              >
                {FEEDSTOCK_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Primary biomass feedstock fed into the pyrolysis kiln.
              </p>
              {errors.feedstock && (
                <p className="mt-1 text-[11px] text-rose-600 font-medium">{errors.feedstock}</p>
              )}
            </div>

            {/* Mass In and Temperature Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="mass_in_kg" className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Raw Biomass Mass In (kg) <span className="text-rose-500">*</span>
                </label>
                <div className="relative rounded-lg">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    id="mass_in_kg"
                    name="mass_in_kg"
                    value={formData.mass_in_kg}
                    onChange={handleChange}
                    placeholder="e.g. 500.00"
                    className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 pr-10"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-slate-400 font-mono">
                    kg
                  </div>
                </div>
                {errors.mass_in_kg && (
                  <p className="mt-1 text-[11px] text-rose-600 font-medium">{errors.mass_in_kg}</p>
                )}
              </div>

              <div>
                <label htmlFor="temp_c" className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Peak Kiln Temperature (°C) <span className="text-rose-500">*</span>
                </label>
                <div className="relative rounded-lg">
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    id="temp_c"
                    name="temp_c"
                    value={formData.temp_c}
                    onChange={handleChange}
                    placeholder="e.g. 550.0"
                    className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 pr-10"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-slate-400 font-mono">
                    °C
                  </div>
                </div>
                {errors.temp_c && (
                  <p className="mt-1 text-[11px] text-rose-600 font-medium">{errors.temp_c}</p>
                )}
              </div>
            </div>

            {/* Mass Out */}
            <div>
              <label htmlFor="mass_out_kg" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Net Biochar Produced (kg) <span className="text-rose-500">*</span>
              </label>
              <div className="relative rounded-lg">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  id="mass_out_kg"
                  name="mass_out_kg"
                  value={formData.mass_out_kg}
                  onChange={handleChange}
                  placeholder="e.g. 150.00"
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 pr-10"
                  required
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs text-slate-400 font-mono">
                  kg
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Dry output biochar mass harvested after pyrolysis quench and cooling.
              </p>
              {errors.mass_out_kg && (
                <p className="mt-1 text-[11px] text-rose-600 font-medium">{errors.mass_out_kg}</p>
              )}
            </div>

            {/* Mass balance warning alert */}
            {massBalanceWarning && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{massBalanceWarning}</span>
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Batch Notes & Telemetry (Optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                placeholder="Kiln identifier, moisture content %, operator remarks, pyrolysis hold duration..."
                className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <p className="mt-1 text-[11px] text-slate-400 font-mono">
                Included in cryptographic SHA-256 payload concatenation.
              </p>
            </div>

            {/* Submit Action */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <Link
                to="/"
                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Sealing Record...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Seal & Sign Batch</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Formula Callout displayed prominently below form */}
          <FormulaCallout />
        </div>

        {/* Dynamic Sidebar Preview (1 col) */}
        <div className="space-y-6">
          {/* Live CO2 preview card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-900 tracking-tight">
                Live Sequestration Preview
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                Live Estimate
              </span>
            </div>

            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Estimated CO₂e Sequestered
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono tabular-nums text-emerald-700">
                  {estimatedCO2}
                </span>
                <span className="text-sm font-medium text-slate-500 font-mono">
                  kg CO₂e
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Biochar mass out:</span>
                <span className="text-slate-900 font-semibold">{formData.mass_out_kg || '0.00'} kg</span>
              </div>
              <div className="flex justify-between">
                <span>Carbon fraction:</span>
                <span>× 0.60</span>
              </div>
              <div className="flex justify-between">
                <span>Stoichiometric ratio:</span>
                <span>× 3.67</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic leading-relaxed">
              Estimated preview only. Authoritative value is strictly computed and cryptographically signed server-side.
            </p>
          </div>

          {/* Pyrolysis info panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-xs text-slate-600 space-y-3">
            <h4 className="font-semibold text-slate-900">
              Field Pyrolysis Reference
            </h4>
            <p className="text-slate-600 leading-relaxed">
              Slow pyrolysis converts solid biomass into stable, recalcitrant carbon. Peak kiln temperature dictates fixed carbon concentration:
            </p>
            <ul className="space-y-1.5 text-slate-600 font-mono text-[11px]">
              <li>• 350°C - 450°C: Higher yield, lower stable C</li>
              <li>• 500°C - 650°C: Optimal agronomic biochar</li>
              <li>• 700°C+: Maximum fixed carbon fraction</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
