import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import {
  VolumeX,
  Info,
  TrendingUp,
  Headphones,
  Compass,
  Sparkles,
  Music,
} from 'lucide-react';
import { SonificationEngine } from '../../accessibility/sonification/SonificationEngine';
import { speechEngine } from '../../utils/speechEngine';
import { earconManager } from '../../accessibility/audio/EarconManager';
import { hapticManager } from '../../accessibility/haptic/HapticManager';
import type { QuestionGraph } from '../../../shared/types';

interface InteractiveSonificationGraphProps {
  graph: QuestionGraph;
  className?: string;
  isStudentMode?: boolean;
}

const EMPTY_DATA: QuestionGraph['data'] = [];

export const InteractiveSonificationGraph: React.FC<InteractiveSonificationGraphProps> = ({
  graph,
  className = '',
}) => {
  const containerId = useId();
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [isExploring, setIsExploring] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlayingSweep, setIsPlayingSweep] = useState(false);
  const [isPlayingTour, setIsPlayingTour] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const activeCancelRef = useRef<(() => void) | null>(null);

  const data = graph?.data ?? EMPTY_DATA;
  const stats = SonificationEngine.computeStats(data);
  const total = data.length;

  // Cleanup active audio/tour on unmount
  useEffect(() => {
    return () => {
      if (activeCancelRef.current) {
        activeCancelRef.current();
        activeCancelRef.current = null;
      }
    };
  }, []);

  // Announce point through sonification tone + speech + live region
  const explorePoint = useCallback(
    (index: number, readDetailed = false) => {
      if (index < 0 || index >= total) return;
      setActiveIndex(index);

      // Play tone with warm timbre and spatial stereo pan
      SonificationEngine.playPointTone(graph, index, 0.35);

      const pt = data[index];
      const unit = graph.unit ? ` ${graph.unit}` : '';
      let peakBadge = '';
      if (pt.value === stats.max && stats.max !== stats.min) peakBadge = ', Peak';
      else if (pt.value === stats.min && stats.max !== stats.min) peakBadge = ', Lowest';

      if (readDetailed) {
        const trend = SonificationEngine.analyzeTrend(data, index, graph.unit);
        const detailedText = `${pt.label}. ${graph.yAxisLabel || 'Value'} is ${pt.value}${unit}${peakBadge}. ${index > 0 ? trend.verbal : ''}`;
        setLiveAnnouncement(`Point ${index + 1} of ${total}: ${detailedText}`);
        speechEngine.speak(detailedText, true);
      } else {
        const text = `${pt.label}: ${pt.value}${unit}${peakBadge}.`;
        setLiveAnnouncement(`Point ${index + 1} of ${total}: ${text}`);
        speechEngine.speak(text, true);
      }
    },
    [data, graph, total, stats]
  );

  // Keyboard navigation inside exploration mode
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // If NOT exploring, Enter/Space enters exploration mode
      if (!isExploring) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsExploring(true);
          earconManager.playEarcon('MIC_START');
          speechEngine.speak(
            `Graph exploration active for ${graph.title || 'data chart'}. Use Left and Right arrows to scrub data points and hear pitch tones, S for summary, T for trend, and Escape to exit.`,
            true
          );
          explorePoint(0, false);
        }
        return;
      }

      // If IN exploration mode:
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          if (activeIndex < total - 1) {
            explorePoint(activeIndex + 1, false);
          } else {
            earconManager.playEarcon('WARNING');
            hapticManager.vibrateError();
            speechEngine.speak('End of data points.', true);
          }
          break;
        }

        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          if (activeIndex > 0) {
            explorePoint(activeIndex - 1, false);
          } else {
            earconManager.playEarcon('WARNING');
            hapticManager.vibrateError();
            speechEngine.speak('Beginning of data points.', true);
          }
          break;
        }

        case 'Home': {
          e.preventDefault();
          explorePoint(0, false);
          break;
        }

        case 'End': {
          e.preventDefault();
          explorePoint(total - 1, false);
          break;
        }

        case 'Enter': {
          e.preventDefault();
          explorePoint(activeIndex, true);
          break;
        }

        case 's':
        case 'S': {
          e.preventDefault();
          const summary = SonificationEngine.generateSummary(graph);
          setLiveAnnouncement(summary);
          speechEngine.speak(summary, true);
          break;
        }

        case 't':
        case 'T': {
          e.preventDefault();
          const trend = SonificationEngine.analyzeTrend(data, activeIndex, graph.unit);
          setLiveAnnouncement(trend.verbal);
          speechEngine.speak(trend.verbal, true);
          break;
        }

        case 'Escape': {
          e.preventDefault();
          if (activeCancelRef.current) {
            activeCancelRef.current();
            activeCancelRef.current = null;
          }
          setIsPlayingSweep(false);
          setIsPlayingTour(false);
          setIsExploring(false);
          earconManager.playEarcon('MIC_STOP');
          speechEngine.speak('Exited graph exploration mode.', true);
          break;
        }

        default:
          break;
      }
    },
    [isExploring, activeIndex, total, graph, data, explorePoint]
  );

  // Play Guided Audio Tour (Tone + Speech sequentially for every point)
  const handlePlayTour = useCallback(() => {
    if (isPlayingTour) {
      if (activeCancelRef.current) {
        activeCancelRef.current();
        activeCancelRef.current = null;
      }
      setIsPlayingTour(false);
      return;
    }

    if (isPlayingSweep && activeCancelRef.current) {
      activeCancelRef.current();
      setIsPlayingSweep(false);
    }

    setIsPlayingTour(true);
    const tour = SonificationEngine.playGuidedTour(
      graph,
      (idx) => setActiveIndex(idx),
      () => {
        setIsPlayingTour(false);
        activeCancelRef.current = null;
      }
    );
    activeCancelRef.current = tour.cancel;
  }, [graph, isPlayingTour, isPlayingSweep]);

  // Play Musical Pitch Sweep (Ear-to-ear tones without speech collision)
  const handlePlaySweep = useCallback(() => {
    if (isPlayingSweep) {
      if (activeCancelRef.current) {
        activeCancelRef.current();
        activeCancelRef.current = null;
      }
      setIsPlayingSweep(false);
      return;
    }

    if (isPlayingTour && activeCancelRef.current) {
      activeCancelRef.current();
      setIsPlayingTour(false);
    }

    setIsPlayingSweep(true);
    speechEngine.speak(`Playing audio pitch sweep across ${total} points.`, true);

    const unsubscribe = speechEngine.onSpeechEnd(() => {
      unsubscribe();
      const sweep = SonificationEngine.playOverviewSweep(
        graph,
        0.45,
        (idx) => setActiveIndex(idx),
        () => {
          setIsPlayingSweep(false);
          activeCancelRef.current = null;
        }
      );
      activeCancelRef.current = sweep.cancel;
    });
  }, [graph, isPlayingSweep, isPlayingTour, total]);

  // Read summary button handler
  const handleReadSummary = () => {
    const summary = SonificationEngine.generateSummary(graph);
    setLiveAnnouncement(summary);
    speechEngine.speak(summary, true);
  };

  // Read trend button handler
  const handleReadTrend = () => {
    const trend = SonificationEngine.analyzeTrend(data, activeIndex, graph.unit);
    setLiveAnnouncement(trend.verbal);
    speechEngine.speak(trend.verbal, true);
  };

  // SVG dimensions
  const svgWidth = 600;
  const svgHeight = 240;
  const padding = { top: 30, right: 30, bottom: 40, left: 55 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  // Scales for Bar and Line
  const valRange = Math.max(1, stats.max - Math.min(0, stats.min));
  const getY = (val: number) => {
    const norm = (val - Math.min(0, stats.min)) / valRange;
    return padding.top + chartH - norm * chartH;
  };

  const getX = (idx: number) => {
    if (total <= 1) return padding.left + chartW / 2;
    return padding.left + (idx / (total - 1)) * chartW;
  };

  const barW = Math.max(16, Math.min(60, chartW / (total * 1.5)));

  return (
    <div
      className={`my-4 p-3.5 sm:p-5 rounded-2xl border-2 transition-all shadow-sm min-w-0 max-w-full overflow-hidden ${
        isExploring
          ? 'border-indigo-500 bg-indigo-500/5 ring-4 ring-indigo-500/20'
          : 'border-theme-border bg-theme-surface'
      } ${className}`}
      aria-label={`${graph.title || 'Data Graph'}. Interactive audio sonification graph.`}
    >
      {/* Live Region for Screen Readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Header bar with Badges & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme-border pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-indigo-600 text-white flex items-center gap-1.5 shadow-sm">
            <Headphones className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Audio Graph ({graph.type.toUpperCase()})</span>
          </span>
          {isExploring && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 animate-pulse">
              ● Active Audio Exploration
            </span>
          )}
        </div>

        {/* Sonification Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Guided Audio Tour */}
          <button
            type="button"
            onClick={handlePlayTour}
            title={isPlayingTour ? 'Stop Guided Tour' : 'Play Guided Audio Tour (Tone and Speech for each point)'}
            aria-label={isPlayingTour ? 'Stop Guided Tour' : 'Play Guided Audio Tour'}
            className="px-3 py-1.5 rounded-lg border border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center gap-1.5 transition"
          >
            {isPlayingTour ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                <span>Stop Tour</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                <span>Guided Tour</span>
              </>
            )}
          </button>

          {/* Pure Pitch Sweep */}
          <button
            type="button"
            onClick={handlePlaySweep}
            title={isPlayingSweep ? 'Stop Pitch Sweep' : 'Play Pitch Sweep across all points'}
            aria-label={isPlayingSweep ? 'Stop Pitch Sweep' : 'Play Pitch Sweep across all points'}
            className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg hover:bg-theme-border/40 text-theme-text font-bold text-xs flex items-center gap-1.5 transition"
          >
            {isPlayingSweep ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                <span>Stop Sweep</span>
              </>
            ) : (
              <>
                <Music className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                <span>Pitch Sweep</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReadSummary}
            title="Read Graph Summary (Shortcut: S)"
            aria-label="Read Graph Summary"
            className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg hover:bg-theme-border/40 text-theme-text font-bold text-xs flex items-center gap-1.5 transition"
          >
            <Info className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
            <span>Summary (S)</span>
          </button>

          <button
            type="button"
            onClick={handleReadTrend}
            title="Analyze Trend from Previous Point (Shortcut: T)"
            aria-label="Analyze Trend"
            className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg hover:bg-theme-border/40 text-theme-text font-bold text-xs flex items-center gap-1.5 transition"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>Trend (T)</span>
          </button>
        </div>
      </div>

      {/* Graph Title & Axis Info */}
      <div className="mb-2">
        <h3 className="text-base font-extrabold text-theme-text flex items-center gap-2">
          <span>{graph.title || 'Data Graph'}</span>
          {graph.unit && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-theme-border/50 text-theme-text/80">
              Unit: {graph.unit}
            </span>
          )}
        </h3>
        <p className="text-xs text-theme-text-secondary mt-0.5 font-medium">
          {graph.xAxisLabel ? `X-Axis: ${graph.xAxisLabel} • ` : ''}
          {graph.yAxisLabel ? `Y-Axis: ${graph.yAxisLabel} • ` : ''}
          {total} data points (Min: {stats.min}, Max: {stats.max})
        </p>
      </div>

      {/* Main Focusable Interactive Graph Container */}
      <div
        id={containerId}
        ref={graphContainerRef}
        role="region"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={`${graph.title || 'Chart'}. Press Space or Enter to explore using Left/Right arrows.`}
        className={`relative w-full rounded-xl p-3 border-2 transition-all outline-none cursor-pointer select-none bg-theme-bg/60 ${
          isExploring
            ? 'border-indigo-500 ring-2 ring-indigo-500/30'
            : 'border-theme-border hover:border-indigo-400 focus:border-indigo-500'
        }`}
      >
        {/* Visual Chart Rendering (Bar / Line / Pie) */}
        {data.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-xs font-semibold text-theme-text-secondary">
            No data points configured for this graph.
          </div>
        ) : graph.type === 'pie' ? (
          /* PIE CHART RENDERER */
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
            <svg
              viewBox="0 0 200 200"
              className="w-44 h-44 drop-shadow-sm"
              role="img"
              aria-label="Pie Chart Representation"
            >
              {(() => {
                let cumulativeAngle = 0;
                const totalVal = Math.max(1, stats.sum);
                const colors = [
                  '#4f46e5',
                  '#06b6d4',
                  '#10b981',
                  '#f59e0b',
                  '#ef4444',
                  '#8b5cf6',
                  '#ec4899',
                  '#64748b',
                ];

                return data.map((pt, i) => {
                  const sliceAngle = (pt.value / totalVal) * 360;
                  const startAngle = cumulativeAngle;
                  const endAngle = cumulativeAngle + sliceAngle;
                  cumulativeAngle = endAngle;

                  const startRad = ((startAngle - 90) * Math.PI) / 180;
                  const endRad = ((endAngle - 90) * Math.PI) / 180;
                  const x1 = 100 + 80 * Math.cos(startRad);
                  const y1 = 100 + 80 * Math.sin(startRad);
                  const x2 = 100 + 80 * Math.cos(endRad);
                  const y2 = 100 + 80 * Math.sin(endRad);
                  const largeArc = sliceAngle > 180 ? 1 : 0;

                  const pathD =
                    total === 1 || sliceAngle >= 359.9
                      ? `M 100, 20 A 80,80 0 1,1 99.9,20 Z`
                      : `M 100,100 L ${x1},${y1} A 80,80 0 ${largeArc},1 ${x2},${y2} Z`;

                  const isSelected = activeIndex === i;
                  return (
                    <path
                      key={pt.id}
                      d={pathD}
                      fill={colors[i % colors.length]}
                      stroke={isSelected ? '#ffffff' : '#1e1b4b'}
                      strokeWidth={isSelected ? 4 : 1.5}
                      className="transition-all cursor-pointer hover:opacity-90"
                      onClick={() => explorePoint(i, true)}
                    />
                  );
                });
              })()}
            </svg>

            {/* Pie Legend */}
            <div className="space-y-1.5 max-w-xs text-xs">
              {data.map((pt, i) => {
                const isSelected = activeIndex === i;
                const colors = [
                  '#4f46e5',
                  '#06b6d4',
                  '#10b981',
                  '#f59e0b',
                  '#ef4444',
                  '#8b5cf6',
                  '#ec4899',
                  '#64748b',
                ];
                const pct = stats.sum > 0 ? Math.round((pt.value / stats.sum) * 100) : 0;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => explorePoint(i, true)}
                    className={`w-full flex items-center justify-between p-1.5 rounded-lg border transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 font-bold'
                        : 'border-transparent hover:bg-theme-border/30 text-theme-text/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: colors[i % colors.length] }}
                      />
                      <span className="truncate">{pt.label}</span>
                    </div>
                    <span className="font-mono ml-2">
                      {pt.value} {graph.unit || ''} ({pct}%)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* BAR AND LINE CHART RENDERER (SVG) */
          <div
            tabIndex={0}
            role="region"
            aria-label="Interactive chart visual graph container"
            className="w-full min-w-0 max-w-full overflow-x-auto focus:outline-none focus:ring-2 focus:ring-theme-primary/50 rounded-xl"
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-56 min-w-[420px]"
              role="img"
              aria-label={`${graph.type === 'bar' ? 'Bar' : 'Line'} chart visual graph`}
            >
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                const y = padding.top + chartH * (1 - pct);
                const val = Math.round(stats.min + pct * (stats.max - stats.min));
                return (
                  <g key={pct}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity={0.12}
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="currentColor"
                      opacity={0.6}
                      fontFamily="monospace"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Line Chart path if type === 'line' */}
              {graph.type === 'line' && data.length > 1 && (
                <path
                  d={data
                    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.value)}`)
                    .join(' ')}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points (Bars / Line Dots) */}
              {data.map((pt, i) => {
                const isSelected = activeIndex === i;
                const x = getX(i);
                const y = getY(pt.value);

                if (graph.type === 'bar') {
                  const bX =
                    total <= 1
                      ? x - barW / 2
                      : padding.left + (i / total) * chartW + (chartW / total - barW) / 2;
                  const bHeight = Math.max(4, padding.top + chartH - y);

                  return (
                    <g
                      key={pt.id}
                      className="cursor-pointer"
                      onClick={() => explorePoint(i, true)}
                    >
                      <rect
                        x={bX}
                        y={y}
                        width={barW}
                        height={bHeight}
                        rx="6"
                        fill={
                          isSelected
                            ? '#4f46e5'
                            : pt.value === stats.max
                              ? '#10b981'
                              : pt.value === stats.min
                                ? '#f59e0b'
                                : '#6366f1'
                        }
                        fillOpacity={isSelected ? 1.0 : 0.75}
                        stroke={isSelected ? '#ffffff' : 'transparent'}
                        strokeWidth="2.5"
                        className="transition-all hover:opacity-100"
                      />
                      {/* Label on X-Axis */}
                      <text
                        x={bX + barW / 2}
                        y={svgHeight - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        fill="currentColor"
                        opacity={isSelected ? 1 : 0.7}
                      >
                        {pt.label}
                      </text>
                      {/* Value above bar if selected */}
                      {isSelected && (
                        <text
                          x={bX + barW / 2}
                          y={y - 8}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="bold"
                          fill="#4f46e5"
                        >
                          {pt.value}
                        </text>
                      )}
                    </g>
                  );
                }

                // Line chart points
                return (
                  <g
                    key={pt.id}
                    className="cursor-pointer"
                    onClick={() => explorePoint(i, true)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 8 : 5}
                      fill={isSelected ? '#4f46e5' : '#818cf8'}
                      stroke={isSelected ? '#ffffff' : '#4f46e5'}
                      strokeWidth={isSelected ? 3 : 2}
                      className="transition-all hover:scale-125"
                    />
                    <text
                      x={x}
                      y={svgHeight - 12}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      fill="currentColor"
                      opacity={isSelected ? 1 : 0.7}
                    >
                      {pt.label}
                    </text>
                    {isSelected && (
                      <text
                        x={x}
                        y={y - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="bold"
                        fill="#4f46e5"
                      >
                        {pt.value}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Exploration Prompt Overlay if not currently exploring */}
        {!isExploring && (
          <div className="mt-2 p-2.5 rounded-lg bg-theme-surface border border-theme-border text-center text-xs text-theme-text/80 font-medium flex items-center justify-center gap-2">
            <Compass className="w-4 h-4 text-indigo-500 animate-spin" aria-hidden="true" />
            <span>
              Click or press <strong>Enter / Space</strong> to enter interactive audio exploration.
            </span>
          </div>
        )}
      </div>

      {/* Active Point Card & Navigation Instructions */}
      <div className="mt-3 p-3 sm:p-3.5 rounded-xl bg-theme-bg border border-theme-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs min-w-0 max-w-full">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-extrabold flex items-center justify-center font-mono">
            {activeIndex + 1}
          </span>
          <div>
            <div className="font-bold text-theme-text">
              Active Point: {data[activeIndex]?.label || 'None'}
            </div>
            <div className="text-theme-text-secondary font-medium">
              Value: <strong>{data[activeIndex]?.value ?? '-'}</strong> {graph.unit || ''}
              {data[activeIndex]?.value === stats.max && stats.max !== stats.min && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-theme-success/20 text-theme-success font-black">
                  ★ Peak
                </span>
              )}
              {data[activeIndex]?.value === stats.min && stats.max !== stats.min && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-theme-marked/20 text-theme-marked font-black">
                  ▼ Low
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard shortcut reminder pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-theme-text-secondary font-medium">
          <span className="px-1.5 py-0.5 rounded bg-theme-border/60 font-mono text-theme-text">← / →</span> Navigate
          <span className="px-1.5 py-0.5 rounded bg-theme-border/60 font-mono text-theme-text">Enter</span> Read Value
          <span className="px-1.5 py-0.5 rounded bg-theme-border/60 font-mono text-theme-text">S</span> Summary
          <span className="px-1.5 py-0.5 rounded bg-theme-border/60 font-mono text-theme-text">T</span> Trend
          <span className="px-1.5 py-0.5 rounded bg-theme-border/60 font-mono text-theme-text">Esc</span> Exit
        </div>
      </div>
    </div>
  );
};
