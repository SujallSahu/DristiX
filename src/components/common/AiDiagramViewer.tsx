import React, { useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RefreshCw, Sparkles, Contrast, Eye, Volume2 } from 'lucide-react';
import { AiDiagramExplainerModal } from './AiDiagramExplainerModal';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { getDataSource } from '../../services/dataSource';
import { type PublicQuestion, type GradedQuestion, type QuestionItem, type AiDiagramExplanation, hasValidAiExplanation } from '../../../shared/types';

interface AiDiagramViewerProps {
  question: PublicQuestion | GradedQuestion | QuestionItem;
  className?: string;
}

export const AiDiagramViewer: React.FC<AiDiagramViewerProps> = ({ question, className = '' }) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const diagramUrl = question.diagramUrl;
  const diagramDescription = question.diagramDescription;
  const diagramType = question.diagramType || 'image';
  const [cachedExplanation, setCachedExplanation] = useState<AiDiagramExplanation | undefined>(
    hasValidAiExplanation(question.diagramAiExplanation) ? question.diagramAiExplanation : undefined
  );
  const aiExplanation = cachedExplanation || (hasValidAiExplanation(question.diagramAiExplanation) ? question.diagramAiExplanation : undefined);

  // Sync cached explanation whenever the active question changes
  useEffect(() => {
    if (hasValidAiExplanation(question.diagramAiExplanation)) {
      setCachedExplanation(question.diagramAiExplanation);
    } else {
      setCachedExplanation(undefined);
    }
  }, [question.id, question.questionNumber, question.diagramAiExplanation]);

  // Background pre-fetch diagram explanation so it is instantly available for student voice / visual guide
  useEffect(() => {
    const needsFetch =
      (diagramUrl || diagramDescription) &&
      !hasValidAiExplanation(question.diagramAiExplanation) &&
      !hasValidAiExplanation(cachedExplanation);

    if (needsFetch) {
      let active = true;
      getDataSource()
        .ai.explainDiagram({
          questionText: question.questionText,
          mathLatex: question.mathLatex,
          diagramUrl,
          diagramType,
          diagramDescription,
        })
        .then((res) => {
          if (active && res && hasValidAiExplanation(res)) {
            setCachedExplanation(res);
            question.diagramAiExplanation = res;
          }
        })
        .catch((err) => {
          console.warn('[dristix] Background diagram pre-fetch error:', err);
        });
      return () => {
        active = false;
      };
    }
  }, [diagramUrl, diagramDescription, question.id, question.questionText, question.mathLatex, diagramType, cachedExplanation, question]);

  // Listen for voice assistant event to open or close the diagram explainer
  useEffect(() => {
    const handleOpenDiagram = () => {
      if (diagramUrl || diagramDescription) {
        setIsModalOpen(true);
      }
    };
    const handleCloseDiagram = () => {
      setIsModalOpen(false);
    };
    window.addEventListener('dristix:open-diagram-explainer', handleOpenDiagram);
    window.addEventListener('dristix:close-diagram-explainer', handleCloseDiagram);
    return () => {
      window.removeEventListener('dristix:open-diagram-explainer', handleOpenDiagram);
      window.removeEventListener('dristix:close-diagram-explainer', handleCloseDiagram);
    };
  }, [diagramUrl, diagramDescription]);

  const handleExplanationGenerated = useCallback(
    (newExpl: AiDiagramExplanation) => {
      setCachedExplanation(newExpl);
      question.diagramAiExplanation = newExpl;
    },
    [question]
  );

  if (!diagramUrl && !diagramDescription) return null;

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.75));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  const handleOpenExplainer = () => {
    setIsModalOpen(true);
    useAnnouncerStore.getState().announce(
      `Opening AI Diagram Explainer for Question ${question.questionNumber}.`,
      'polite',
      false
    );
  };

  return (
    <div className={`my-4 space-y-3 ${className}`}>
      {/* Main Diagram Card */}
      <div
        className={`relative p-4 rounded-2xl border-2 shadow-sm transition-all overflow-hidden ${
          highContrast
            ? 'bg-black text-white border-yellow-400'
            : 'bg-theme-bg border-indigo-500/30'
        }`}
      >
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-theme-border">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-indigo-600 text-white">
              {diagramType === 'geometry' ? '📐 Geometry Diagram' : diagramType === 'chart' ? '📊 Data Graph' : '🖼️ Diagram'}
            </span>
            <span className="text-xs font-semibold text-theme-text/70">
              Q{question.questionNumber} Visual Asset
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleZoomIn}
              title="Zoom In"
              aria-label="Zoom in diagram"
              className="p-1.5 rounded-lg border border-theme-border hover:bg-theme-surface text-theme-text transition"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              title="Zoom Out"
              aria-label="Zoom out diagram"
              className="p-1.5 rounded-lg border border-theme-border hover:bg-theme-surface text-theme-text transition"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              title="Reset Zoom"
              aria-label="Reset diagram zoom"
              className="p-1.5 rounded-lg border border-theme-border hover:bg-theme-surface text-theme-text transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHighContrast(!highContrast)}
              title="Toggle High Contrast for Diagram"
              aria-label="Toggle diagram high contrast"
              className={`p-1.5 rounded-lg border transition ${
                highContrast
                  ? 'bg-yellow-400 text-black border-yellow-500 font-bold'
                  : 'border-theme-border text-theme-text hover:bg-theme-surface'
              }`}
            >
              <Contrast className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Diagram Image / Display Canvas */}
        <div className="overflow-auto max-h-80 flex items-center justify-center p-2">
          {diagramUrl ? (
            <img
              src={diagramUrl}
              alt={diagramDescription || `Diagram for Question ${question.questionNumber}`}
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
              className={`transition-transform duration-200 max-h-72 object-contain rounded-lg ${
                highContrast ? 'invert contrast-200' : ''
              }`}
            />
          ) : (
            <div className="p-6 text-center rounded-xl bg-theme-surface border border-theme-border max-w-lg">
              <Eye className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-theme-text">{diagramDescription}</p>
            </div>
          )}
        </div>

        {/* Caption */}
        {diagramDescription && diagramUrl && (
          <p className="text-xs text-center text-theme-text/70 mt-2 italic font-mono">
            Figure: {diagramDescription}
          </p>
        )}

        {/* AI Diagram Explanation Trigger Banner */}
        <div className="mt-4 pt-3 border-t border-theme-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 p-3 rounded-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 animate-bounce" />
            <span className="text-xs font-bold text-theme-text">
              Need help interpreting this diagram?
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpenExplainer}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:brightness-110 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md transition focus:ring-4 focus:ring-indigo-500/50"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>AI Diagram Breakdown & Voice Guide</span>
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Explainer Modal */}
      <AiDiagramExplainerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        questionNumber={question.questionNumber}
        questionText={question.questionText}
        mathLatex={question.mathLatex}
        diagramUrl={diagramUrl}
        diagramDescription={diagramDescription}
        diagramType={diagramType}
        aiExplanation={aiExplanation}
        onExplanationGenerated={handleExplanationGenerated}
      />
    </div>
  );
};
