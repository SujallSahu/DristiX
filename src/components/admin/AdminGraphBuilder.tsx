import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import { SonificationEngine } from '../../accessibility/sonification/SonificationEngine';
import { InteractiveSonificationGraph } from '../sonification/InteractiveSonificationGraph';
import { speechEngine } from '../../utils/speechEngine';
import type { QuestionGraph, GraphDataPoint, GraphType } from '../../../shared/types';

interface AdminGraphBuilderProps {
  graph: QuestionGraph;
  onChange: (updatedGraph: QuestionGraph) => void;
}

export const AdminGraphBuilder: React.FC<AdminGraphBuilderProps> = ({ graph, onChange }) => {
  const [activeTab, setActiveTab] = useState<'table' | 'settings' | 'import'>('table');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [previewActiveIndex, setPreviewActiveIndex] = useState(0);

  const data = graph.data || [];
  const sonification = graph.sonification || {
    enabled: true,
    spatialAudio: true,
    trendDetection: true,
    peakDetection: true,
    haptic: true,
    voiceDetail: 'standard',
    minFrequency: 250,
    maxFrequency: 900,
  };

  // Helper to update top-level graph property
  const updateGraph = <K extends keyof QuestionGraph>(key: K, value: QuestionGraph[K]) => {
    onChange({
      ...graph,
      [key]: value,
    });
  };

  // Helper to update sonification setting
  const updateSonification = <K extends keyof typeof sonification>(
    key: K,
    value: (typeof sonification)[K]
  ) => {
    onChange({
      ...graph,
      sonification: {
        ...sonification,
        [key]: value,
      },
    });
  };

  // Data point operations
  const handleAddPoint = () => {
    const newId = `pt-${Date.now()}`;
    const newLabel = `Point ${data.length + 1}`;
    const newValue = data.length > 0 ? data[data.length - 1].value + 10 : 50;
    const updated = [...data, { id: newId, label: newLabel, value: newValue }];
    updateGraph('data', updated);
  };

  const handleUpdatePoint = (index: number, field: 'label' | 'value', val: string | number) => {
    const updated = [...data];
    if (field === 'label') {
      updated[index] = { ...updated[index], label: String(val) };
    } else {
      const num = Number(val);
      updated[index] = { ...updated[index], value: isNaN(num) ? 0 : num };
    }
    updateGraph('data', updated);
  };

  const handleDeletePoint = (index: number) => {
    if (data.length <= 1) return;
    const updated = data.filter((_, i) => i !== index);
    updateGraph('data', updated);
  };

  const handleMovePoint = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= data.length) return;
    const updated = [...data];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    updateGraph('data', updated);
  };

  const handleClearAllPoints = () => {
    if (window.confirm('Are you sure you want to clear all data points?')) {
      updateGraph('data', [
        { id: '1', label: 'Item 1', value: 10 },
        { id: '2', label: 'Item 2', value: 20 },
      ]);
    }
  };

  // CSV and JSON Import Handler with strict validation
  const handleImportData = () => {
    setImportError('');
    setImportSuccess('');

    const text = importText.trim();
    if (!text) {
      setImportError('Please paste CSV or JSON data to import.');
      return;
    }

    try {
      // 1. Try JSON import
      if (text.startsWith('[') || text.startsWith('{')) {
        const parsed = JSON.parse(text);
        const arrayData = Array.isArray(parsed) ? parsed : parsed.data;

        if (!Array.isArray(arrayData) || arrayData.length === 0) {
          setImportError('JSON must be an array of objects or an object with a "data" array.');
          return;
        }

        const validated: GraphDataPoint[] = [];
        for (let i = 0; i < arrayData.length; i++) {
          const item = arrayData[i];
          if (!item || typeof item !== 'object') {
            setImportError(`Item ${i + 1} is not a valid object.`);
            return;
          }
          if (item.label === undefined || item.label === null || String(item.label).trim() === '') {
            setImportError(`Item ${i + 1} is missing a required "label" string.`);
            return;
          }
          const numVal = Number(item.value);
          if (isNaN(numVal)) {
            setImportError(`Item ${i + 1} has non-numeric value: "${item.value}".`);
            return;
          }
          validated.push({
            id: String(item.id || item.label || `pt-${i + 1}`),
            label: String(item.label).trim(),
            value: numVal,
          });
        }

        updateGraph('data', validated);
        setImportSuccess(`Successfully imported ${validated.length} data points from JSON!`);
        setImportText('');
        return;
      }

      // 2. Try CSV import
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setImportError('CSV must contain a header row (e.g. label,value) and at least one data row.');
        return;
      }

      const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
      const labelIdx = header.indexOf('label');
      const valIdx = header.indexOf('value');

      if (labelIdx === -1 || valIdx === -1) {
        setImportError('CSV header must contain "label" and "value" columns (e.g. label,value).');
        return;
      }

      const validated: GraphDataPoint[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
        if (parts.length <= Math.max(labelIdx, valIdx)) {
          setImportError(`CSV Row ${i + 1} is malformed or has missing columns.`);
          return;
        }

        const rawLabel = parts[labelIdx];
        const rawVal = parts[valIdx];

        if (!rawLabel) {
          setImportError(`CSV Row ${i + 1} has an empty label.`);
          return;
        }

        const numVal = Number(rawVal);
        if (isNaN(numVal)) {
          setImportError(`CSV Row ${i + 1} has a non-numeric value: "${rawVal}".`);
          return;
        }

        validated.push({
          id: `pt-${i}-${rawLabel}`,
          label: rawLabel,
          value: numVal,
        });
      }

      updateGraph('data', validated);
      setImportSuccess(`Successfully imported ${validated.length} data points from CSV!`);
      setImportText('');
    } catch (err: any) {
      setImportError(`Data import failed: ${err?.message || 'Invalid format'}.`);
    }
  };

  // Live Audio Preview Testing functions
  const handlePlayPreviewPoint = (idx: number) => {
    if (idx < 0 || idx >= data.length) return;
    setPreviewActiveIndex(idx);
    SonificationEngine.playPointTone(graph, idx);
    const pt = data[idx];
    speechEngine.speak(`${pt.label}. Value ${pt.value} ${graph.unit || ''}`, true);
  };

  const handleTestSummary = () => {
    const sum = SonificationEngine.generateSummary(graph);
    speechEngine.speak(sum, true);
  };

  const handleTestTrend = () => {
    const trend = SonificationEngine.analyzeTrend(data, previewActiveIndex, graph.unit);
    speechEngine.speak(trend.verbal, true);
  };

  const handleTestPeak = () => {
    const stats = SonificationEngine.computeStats(data);
    if (!stats.maxPoint) return;
    const peakIdx = data.findIndex((d) => d.id === stats.maxPoint?.id);
    if (peakIdx !== -1) {
      handlePlayPreviewPoint(peakIdx);
      speechEngine.speak(`Peak is ${stats.maxPoint.value} in ${stats.maxPoint.label}.`, true);
    }
  };

  const handleTestLow = () => {
    const stats = SonificationEngine.computeStats(data);
    if (!stats.minPoint) return;
    const lowIdx = data.findIndex((d) => d.id === stats.minPoint?.id);
    if (lowIdx !== -1) {
      handlePlayPreviewPoint(lowIdx);
      speechEngine.speak(`Lowest value is ${stats.minPoint.value} in ${stats.minPoint.label}.`, true);
    }
  };

  return (
    <div className="p-3.5 sm:p-5 rounded-2xl bg-indigo-500/5 border-2 border-indigo-500/30 space-y-6 max-w-full overflow-hidden">
      {/* Builder Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-theme-border pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow shrink-0">
            📊
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-theme-text truncate sm:whitespace-normal">
              Data Sonification Configuration & Graph Builder
            </h3>
            <p className="text-xs text-theme-text/70">
              Create accessible auditory graphs stored in MongoDB and experienced identically by candidates.
            </p>
          </div>
        </div>

        {/* Graph Type Selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start shrink-0">
          <label htmlFor="admin-graph-type" className="text-xs font-bold text-theme-text/80 uppercase shrink-0">Graph Type:</label>
          <select
            id="admin-graph-type"
            aria-label="Graph Type"
            title="Select Graph Type"
            value={graph.type}
            onChange={(e) => updateGraph('type', e.target.value as GraphType)}
            className="p-2 rounded-xl bg-theme-surface border-2 border-theme-border font-bold text-xs text-theme-text outline-none focus:border-indigo-500 min-w-0 max-w-full"
          >
            <option value="bar">📊 Bar Chart (Comparative)</option>
            <option value="line">📈 Line Chart (Temporal / Trend)</option>
            <option value="pie">🥧 Pie Chart (Proportional)</option>
          </select>
        </div>
      </div>

      {/* Axis & Metadata Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-theme-text/70 uppercase mb-1">
            Graph Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={graph.title}
            onChange={(e) => updateGraph('title', e.target.value)}
            placeholder="e.g. Annual Company Sales"
            className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs font-semibold text-theme-text"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-theme-text/70 uppercase mb-1">
            X-Axis Label (Categories)
          </label>
          <input
            type="text"
            value={graph.xAxisLabel}
            onChange={(e) => updateGraph('xAxisLabel', e.target.value)}
            placeholder="e.g. Financial Year"
            className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs font-semibold text-theme-text"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-theme-text/70 uppercase mb-1">
            Y-Axis Label (Metric)
          </label>
          <input
            type="text"
            value={graph.yAxisLabel}
            onChange={(e) => updateGraph('yAxisLabel', e.target.value)}
            placeholder="e.g. Revenue"
            className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs font-semibold text-theme-text"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-theme-text/70 uppercase mb-1">
            Measurement Unit
          </label>
          <input
            type="text"
            value={graph.unit || ''}
            onChange={(e) => updateGraph('unit', e.target.value)}
            placeholder="e.g. ₹ Crore, %, Units"
            className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs font-semibold text-theme-text"
          />
        </div>
      </div>

      {/* Builder Inner Tabs */}
      <div className="flex border-b border-theme-border gap-2 overflow-x-auto max-w-full pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('table')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap ${
            activeTab === 'table'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-theme-text/70 hover:text-theme-text'
          }`}
        >
          📋 Data Table Builder ({data.length} points)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-theme-text/70 hover:text-theme-text'
          }`}
        >
          🎛️ Sonification & Pitch Settings
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition shrink-0 whitespace-nowrap ${
            activeTab === 'import'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-theme-text/70 hover:text-theme-text'
          }`}
        >
          📁 Import CSV / JSON
        </button>
      </div>

      {/* TAB 1: DATA TABLE BUILDER */}
      {activeTab === 'table' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-theme-text/80">
              Enter individual labels and numeric values. Order defines left-to-right progression.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddPoint}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-indigo-700 transition shadow"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Data Point</span>
              </button>
              <button
                type="button"
                onClick={handleClearAllPoints}
                className="px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white font-bold text-xs transition"
              >
                Clear All
              </button>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Graph data points editor table"
            className="overflow-x-auto rounded-xl border border-theme-border bg-theme-surface focus:outline-none focus:ring-2 focus:ring-theme-primary/50"
          >
            <table className="w-full text-xs text-left" role="table" aria-label="Graph data points editor">
              <thead className="bg-theme-bg/80 border-b border-theme-border text-theme-text/70 uppercase">
                <tr>
                  <th className="p-2.5 w-12 text-center">#</th>
                  <th className="p-2.5">Label (X-Axis / Slice)</th>
                  <th className="p-2.5 w-32">Value (Numeric)</th>
                  <th className="p-2.5 w-40 text-center">Reorder</th>
                  <th className="p-2.5 w-20 text-center">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {data.map((pt, idx) => (
                  <tr key={pt.id || idx} className="hover:bg-theme-bg/40 transition">
                    <td className="p-2.5 text-center font-mono font-bold text-theme-text/60">
                      {idx + 1}
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={pt.label}
                        onChange={(e) => handleUpdatePoint(idx, 'label', e.target.value)}
                        placeholder="Label (e.g. 2021)"
                        className="w-full p-1.5 rounded bg-theme-bg border border-theme-border text-theme-text font-medium outline-none focus:border-indigo-500"
                        aria-label={`Label for point ${idx + 1}`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="any"
                        value={pt.value}
                        onChange={(e) => handleUpdatePoint(idx, 'value', e.target.value)}
                        placeholder="Value (e.g. 65)"
                        className="w-full p-1.5 rounded bg-theme-bg border border-theme-border text-theme-text font-mono font-bold outline-none focus:border-indigo-500"
                        aria-label={`Value for point ${idx + 1}`}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMovePoint(idx, 'up')}
                          title="Move point up"
                          aria-label={`Move point ${idx + 1} up`}
                          className="p-1 rounded hover:bg-theme-bg disabled:opacity-30 text-theme-text transition"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === data.length - 1}
                          onClick={() => handleMovePoint(idx, 'down')}
                          title="Move point down"
                          aria-label={`Move point ${idx + 1} down`}
                          className="p-1 rounded hover:bg-theme-bg disabled:opacity-30 text-theme-text transition"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        disabled={data.length <= 1}
                        onClick={() => handleDeletePoint(idx)}
                        title="Delete point"
                        aria-label={`Delete point ${idx + 1}`}
                        className="p-1 text-red-500 hover:text-red-700 disabled:opacity-30 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SONIFICATION SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Toggles */}
            <div className="p-4 rounded-xl bg-theme-surface border border-theme-border space-y-3">
              <h4 className="text-xs font-bold text-theme-text uppercase">Auditory & Tactile Toggles</h4>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-semibold text-theme-text">Enable Sonification</span>
                <input
                  type="checkbox"
                  checked={sonification.enabled}
                  onChange={(e) => updateSonification('enabled', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-semibold text-theme-text">Enable Stereo Spatial Audio</span>
                <input
                  type="checkbox"
                  checked={sonification.spatialAudio}
                  onChange={(e) => updateSonification('spatialAudio', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-semibold text-theme-text">Enable Trend Detection</span>
                <input
                  type="checkbox"
                  checked={sonification.trendDetection}
                  onChange={(e) => updateSonification('trendDetection', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-semibold text-theme-text">Enable Peak / Low Detection</span>
                <input
                  type="checkbox"
                  checked={sonification.peakDetection}
                  onChange={(e) => updateSonification('peakDetection', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-semibold text-theme-text">Enable Haptic Feedback</span>
                <input
                  type="checkbox"
                  checked={sonification.haptic}
                  onChange={(e) => updateSonification('haptic', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>
            </div>

            {/* Frequencies & Voice */}
            <div className="p-4 rounded-xl bg-theme-surface border border-theme-border space-y-3">
              <h4 className="text-xs font-bold text-theme-text uppercase">Frequency Range & Narration</h4>

              <div>
                <label className="block text-[11px] font-semibold text-theme-text/70 mb-1">
                  Low Frequency (Min Value Pitch): {sonification.minFrequency ?? 250} Hz
                </label>
                <input
                  type="range"
                  min="150"
                  max="400"
                  step="10"
                  value={sonification.minFrequency ?? 250}
                  onChange={(e) => updateSonification('minFrequency', Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-theme-text/70 mb-1">
                  High Frequency (Max Value Pitch): {sonification.maxFrequency ?? 900} Hz
                </label>
                <input
                  type="range"
                  min="600"
                  max="1400"
                  step="25"
                  value={sonification.maxFrequency ?? 900}
                  onChange={(e) => updateSonification('maxFrequency', Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label htmlFor="admin-sonification-voice-detail" className="block text-[11px] font-semibold text-theme-text/70 mb-1">
                  Voice Speech Detail Level
                </label>
                <select
                  id="admin-sonification-voice-detail"
                  aria-label="Voice Speech Detail Level"
                  title="Voice Speech Detail Level"
                  value={sonification.voiceDetail || 'standard'}
                  onChange={(e) => updateSonification('voiceDetail', e.target.value as any)}
                  className="w-full p-2 rounded-lg bg-theme-bg border border-theme-border text-xs text-theme-text font-bold"
                >
                  <option value="minimal">Minimal (Shortest, Fast Navigation)</option>
                  <option value="standard">Standard (Label + Value + Unit)</option>
                  <option value="detailed">Detailed (Includes Point # and Trend Context)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IMPORT CSV / JSON */}
      {activeTab === 'import' && (
        <div className="space-y-3">
          <div className="text-xs text-theme-text/80 leading-relaxed">
            Paste either raw <strong>CSV</strong> (with <code>label,value</code> columns) or <strong>JSON</strong> array. Data will be strictly validated for numeric values and non-empty labels.
          </div>

          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={5}
            placeholder={`label,value\n2020,40\n2021,65\n2022,90\n2023,55\n2024,75`}
            className="w-full p-3 rounded-xl bg-theme-surface border border-theme-border font-mono text-xs text-theme-text"
          />

          {importError && (
            <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500 text-red-500 text-xs font-bold">
              ⚠️ {importError}
            </div>
          )}

          {importSuccess && (
            <div role="status" className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              ✓ {importSuccess}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleImportData}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-indigo-700 transition shadow"
            >
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
              <span>Validate & Import Data</span>
            </button>
          </div>
        </div>
      )}

      {/* LIVE INTERACTIVE GRAPH & AUDIO PREVIEW SECTION */}
      <div className="pt-4 border-t border-theme-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-500" aria-hidden="true" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-theme-text">
              Live Preview & Acoustic Audit
            </h4>
          </div>

          {/* Audio Test Toolbar for Admin */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => handlePlayPreviewPoint(Math.max(0, previewActiveIndex - 1))}
              disabled={previewActiveIndex <= 0}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 disabled:opacity-40 font-bold"
            >
              ← Prev Point
            </button>
            <button
              type="button"
              onClick={() => handlePlayPreviewPoint(Math.min(data.length - 1, previewActiveIndex + 1))}
              disabled={previewActiveIndex >= data.length - 1}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 disabled:opacity-40 font-bold"
            >
              Next Point →
            </button>
            <button
              type="button"
              onClick={() => handlePlayPreviewPoint(previewActiveIndex)}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 font-bold text-indigo-500"
            >
              Read Value
            </button>
            <button
              type="button"
              onClick={handleTestSummary}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 font-bold text-emerald-500"
            >
              Test Summary
            </button>
            <button
              type="button"
              onClick={handleTestTrend}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 font-bold text-amber-500"
            >
              Test Trend
            </button>
            <button
              type="button"
              onClick={handleTestPeak}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 font-bold text-purple-500"
            >
              Test Peak
            </button>
            <button
              type="button"
              onClick={handleTestLow}
              className="px-2.5 py-1 rounded bg-theme-surface border border-theme-border hover:bg-theme-border/40 font-bold text-blue-500"
            >
              Test Low
            </button>
          </div>
        </div>

        {/* Live Student Component Preview */}
        <InteractiveSonificationGraph graph={graph} isStudentMode={false} />
      </div>
    </div>
  );
};
