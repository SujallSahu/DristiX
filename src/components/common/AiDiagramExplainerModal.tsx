import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, X, Sparkles, Eye, CheckCircle2, Lightbulb, Play, Pause, Loader2, RefreshCw } from 'lucide-react';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { speechEngine } from '../../utils/speechEngine';
import { getDataSource } from '../../services/dataSource';
import { type AiDiagramExplanation, hasValidAiExplanation } from '../../../shared/types';
import { explainDiagram } from '../../utils/visualMathExplainer';
import { isHindiPreferred } from '../../utils/voiceRecognition';

interface AiDiagramExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionNumber?: number;
  questionText: string;
  mathLatex?: string;
  diagramUrl?: string;
  diagramDescription?: string;
  diagramType?: 'image' | 'chart' | 'geometry' | 'svg';
  aiExplanation?: AiDiagramExplanation;
  onExplanationGenerated?: (explanation: AiDiagramExplanation) => void;
}

export const AiDiagramExplainerModal: React.FC<AiDiagramExplainerModalProps> = ({
  isOpen,
  onClose,
  questionNumber,
  questionText,
  mathLatex,
  diagramUrl,
  diagramDescription,
  diagramType,
  aiExplanation,
  onExplanationGenerated,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [explanation, setExplanation] = useState<AiDiagramExplanation | undefined>(
    hasValidAiExplanation(aiExplanation) ? aiExplanation : undefined
  );
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const hasNarratedRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const onExplanationGeneratedRef = useRef(onExplanationGenerated);
  onExplanationGeneratedRef.current = onExplanationGenerated;

  // Reset session flags when modal is closed
  useEffect(() => {
    if (!isOpen) {
      hasNarratedRef.current = false;
      hasFetchedRef.current = false;
      setIsPlayingAudio(false);
      setFetchError(null);
      speechEngine.stop();
    }
  }, [isOpen]);

  // Sync state if valid explanation prop arrives
  useEffect(() => {
    if (hasValidAiExplanation(aiExplanation)) {
      setExplanation(aiExplanation);
    }
  }, [aiExplanation]);

  // Auto-narrate and fetch explanation dynamically when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // 1. If we already have a valid explanation, narrate it once per open session
    if (hasValidAiExplanation(explanation)) {
      if (!hasNarratedRef.current) {
        hasNarratedRef.current = true;
        // Do not interrupt the assistant if it is already speaking the diagram explanation
        if (!speechEngine.isSpeaking()) {
          setIsPlayingAudio(true);
          const isHindi = isHindiPreferred();
          const dRes = explainDiagram(
            {
              questionNumber,
              diagramAiExplanation: explanation,
              diagramDescription,
              diagramUrl,
              diagramType,
            },
            isHindi
          );
          useAnnouncerStore.getState().announce(dRes.speech, 'assertive', true);
          const unsub = speechEngine.onSpeechEnd(() => setIsPlayingAudio(false));
          return () => {
            if (unsub) unsub();
          };
        }
      }
      return;
    }

    // 2. Otherwise fetch from AI Multimodal Vision (at most once per open session)
    if (!hasValidAiExplanation(explanation) && !hasFetchedRef.current && !isLoading && !fetchError) {
      hasFetchedRef.current = true;
      let cancelled = false;

      const fetchAiExpl = async () => {
        setIsLoading(true);
        setFetchError(null);
        const isHindi = isHindiPreferred();
        if (!speechEngine.isSpeaking()) {
          useAnnouncerStore
            .getState()
            .announce(
              isHindi
                ? `प्रश्न ${questionNumber || ''} के विजुअल आरेख का AI विश्लेषण किया जा रहा है...`
                : `AI Multimodal Vision is analyzing visual diagram for Question ${questionNumber || ''}...`,
              'assertive',
              true
            );
        }

        try {
          const res = await getDataSource().ai.explainDiagram({
            questionText,
            mathLatex,
            diagramUrl,
            diagramType,
            diagramDescription,
          });

          if (!cancelled && res && hasValidAiExplanation(res)) {
            setExplanation(res);
            onExplanationGeneratedRef.current?.(res);
            if (!hasNarratedRef.current && !speechEngine.isSpeaking()) {
              hasNarratedRef.current = true;
              setIsPlayingAudio(true);
              const isHi = isHindiPreferred();
              const dRes = explainDiagram(
                {
                  questionNumber,
                  diagramAiExplanation: res,
                  diagramDescription,
                  diagramUrl,
                  diagramType,
                },
                isHi
              );
              useAnnouncerStore.getState().announce(dRes.speech, 'assertive', true);
              speechEngine.onSpeechEnd(() => setIsPlayingAudio(false));
            }
          }
        } catch (err: any) {
          if (!cancelled) {
            console.error('[dristix] failed to fetch diagram explanation:', err);
            setFetchError(err?.message || 'Could not connect to AI Vision Engine.');
            const isHi = isHindiPreferred();
            useAnnouncerStore
              .getState()
              .announce(
                isHi
                  ? `AI आरेख विश्लेषण लोड नहीं हो सका: ${err?.message || 'AI विजन सेवा अनुपलब्ध है।'}`
                  : `Could not load AI diagram breakdown: ${err?.message || 'AI Vision service is unavailable.'}`,
                'assertive',
                true
              );
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      };

      void fetchAiExpl();
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, explanation, isLoading, fetchError, questionText, mathLatex, diagramUrl, diagramType, diagramDescription, questionNumber]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        speechEngine.stop();
        setIsPlayingAudio(false);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleVoice = () => {
    const isHindi = isHindiPreferred();
    if (isPlayingAudio || speechEngine.isSpeaking()) {
      speechEngine.stop();
      setIsPlayingAudio(false);
      const pausedMsg = isHindi ? 'डायग्राम ऑडियो व्याख्या रोकी गई।' : 'Diagram audio narration paused.';
      useAnnouncerStore.getState().announce(pausedMsg, 'polite', true);
    } else {
      setIsPlayingAudio(true);
      const dRes = explainDiagram(
        {
          questionNumber,
          diagramAiExplanation: explanation,
          diagramDescription,
          diagramUrl,
          diagramType,
        },
        isHindi
      );
      useAnnouncerStore.getState().announce(dRes.speech, 'assertive', true);
      speechEngine.onSpeechEnd(() => setIsPlayingAudio(false));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagram-explainer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-3xl rounded-3xl bg-theme-surface border-2 border-indigo-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-indigo-950 via-purple-900 to-indigo-900 text-white flex items-center justify-between border-b border-indigo-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-900">
                  AI Multimodal Vision
                </span>
                <span className="text-xs text-indigo-200 font-semibold">
                  {questionNumber ? `Question Q${questionNumber}` : 'Interactive Analysis'}
                </span>
              </div>
              <h2 id="diagram-explainer-title" className="text-xl sm:text-2xl font-black text-white">
                AI Diagram Explainer & Audio Guide
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              speechEngine.stop();
              setIsPlayingAudio(false);
              onClose();
            }}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition focus:ring-2 focus:ring-white"
            aria-label="Close AI Diagram Explainer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-theme-text font-sans">
          {isLoading && (
            <div className="p-8 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500 flex items-center justify-center text-indigo-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-theme-text">Analyzing Visual Diagram Elements</h3>
                <p className="text-xs text-theme-text/70 max-w-md">
                  DristiX Multimodal AI is inspecting visual geometry, chart slices, coordinates, and spatial labels to construct your auditory scene description...
                </p>
              </div>
            </div>
          )}

          {fetchError && !isLoading && !explanation && (
            <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-4">
              <div className="text-xs text-red-500 font-semibold">
                <span>{fetchError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFetchError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Audio Narration Bar */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-pink-500/15 border-2 border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-theme-text">Voice Audio Diagram Guide</h3>
                <p className="text-xs text-theme-text/70">
                  Synthesized speech breakdown designed for screen-readers & visually impaired students.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleToggleVoice}
                disabled={isLoading}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md ${
                  isPlayingAudio
                    ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                }`}
              >
                {isPlayingAudio ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause Audio</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Listen Diagram Breakdown</span>
                  </>
                )}
              </button>

              {isPlayingAudio && (
                <button
                  type="button"
                  onClick={() => {
                    speechEngine.stop();
                    setIsPlayingAudio(false);
                  }}
                  className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition"
                  title="Stop Speech"
                >
                  <VolumeX className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Diagram Preview */}
          {diagramUrl && (
            <div className="p-4 rounded-2xl bg-theme-bg border-2 border-theme-border flex flex-col items-center justify-center">
              <img
                src={diagramUrl}
                alt={diagramDescription || 'Question diagram preview'}
                className="max-h-64 object-contain rounded-lg shadow-sm"
              />
              {diagramDescription && (
                <p className="text-xs font-mono text-theme-text/60 mt-2 text-center max-w-lg">
                  Caption: {diagramDescription}
                </p>
              )}
            </div>
          )}

          {/* 1. Visual Elements Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-500 font-extrabold text-base">
              <Eye className="w-5 h-5 text-indigo-500" />
              <span>1. Visual Elements & Spatial Structure</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(explanation?.visualBreakdown?.length
                ? explanation.visualBreakdown
                : [
                    diagramDescription || 'Diagram represents geometry/data elements.',
                    'Key parameters labeled on shapes/axes.',
                  ]
              ).map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-theme-bg border border-theme-border flex items-start gap-2 text-xs font-medium"
                >
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-500 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-theme-text">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Educational Context & Solving Step */}
          <div className="p-5 rounded-2xl bg-indigo-500/5 border-2 border-indigo-500/20 space-y-2">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-base">
              <Lightbulb className="w-5 h-5" />
              <span>2. How to Read & Solve from Diagram</span>
            </div>
            <p className="text-sm leading-relaxed text-theme-text font-medium">
              {explanation?.educationalContext ||
                `The diagram depicts visual variables related to the problem statement "${questionText}". Analyze the labeled positions and apply the corresponding mathematical or logical steps to resolve the options.`}
            </p>
          </div>

          {/* 3. Key Takeaways */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-extrabold text-base">
              <CheckCircle2 className="w-5 h-5" />
              <span>3. Key Diagnostic Findings</span>
            </div>
            <ul className="space-y-2">
              {(explanation?.keyPoints?.length
                ? explanation.keyPoints
                : ['Verify labels on the diagram.', 'Apply correct formulas.', 'Cross-check options.']
              ).map((kp, idx) => (
                <li
                  key={idx}
                  className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-theme-text flex items-center gap-2"
                >
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>{kp}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-theme-bg border-t border-theme-border flex items-center justify-between text-xs text-theme-text/60">
          <span>Powered by DristiX Multimodal AI & Speech Engine</span>
          <button
            type="button"
            onClick={() => {
              speechEngine.stop();
              setIsPlayingAudio(false);
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-theme-surface border border-theme-border hover:border-theme-primary font-bold text-theme-text transition"
          >
            Close Explainer
          </button>
        </div>
      </div>
    </div>
  );
};
