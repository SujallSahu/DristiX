import React, { useState } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import { MathEquation } from '../common/MathEquation';
import { AiDiagramViewer } from '../common/AiDiagramViewer';
import { InteractiveSonificationGraph } from '../sonification/InteractiveSonificationGraph';
import {
  Award,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Volume2,
  TrendingUp,
  Bookmark,
  Printer,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Sparkles,
  Star,
} from 'lucide-react';

export const DiagnosticReport: React.FC = () => {
  const {
    currentExam,
    questions,
    selectedOptions,
    markedForReview,
    getDiagnosticReport,
    resetExam,
    returnToCatalog,
    feedback,
    openFeedbackModal,
  } = useExamStore();
  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect' | 'marked'>('all');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  const report = getDiagnosticReport();

  const negativeMarkingStr = String(currentExam?.negativeMarking || '');
  const isPracticeMode = negativeMarkingStr.toLowerCase().includes('no negative') || negativeMarkingStr === '0';
  const penaltyMatch = negativeMarkingStr.match(/(\d+(\.\d+)?)/);
  const penaltyValue = !isPracticeMode && penaltyMatch ? penaltyMatch[1] : null;
  const marksPerQ = currentExam?.totalMarks && questions.length > 0
    ? Number((currentExam.totalMarks / questions.length).toFixed(1))
    : 1;

  const handleReadSummary = () => {
    soundEffects.unlock();
    const fullSummary = report.verbalSummary?.join(' ') || `Score: ${report.totalScore} out of ${report.maxScore} points.`;
    useAnnouncerStore.getState().announce(
      `Performance Diagnostic and Analytics Report for ${report.examTitle}: ${fullSummary} You can say "Retake test" or "Choose another exam".`,
      'assertive',
      true
    );
  };

  React.useEffect(() => {
    const { submissionTime } = useExamStore.getState();
    const timeSinceSubmission = Date.now() - (submissionTime || 0);
    // Announce if navigating back to report screen or if not already freshly spoken by submitExam
    if (timeSinceSubmission > 5000) {
      const fullSummary = report.verbalSummary?.join(' ') || `Score: ${report.totalScore} out of ${report.maxScore} points.`;
      useAnnouncerStore.getState().announce(
        `Viewing Performance Diagnostic Report for ${report.examTitle}. ${fullSummary} You can say "Read summary", "Retake test", or "Choose another exam".`,
        'polite',
        false
      );
    }
  }, [report.examTitle, report.totalScore, report.maxScore, report.verbalSummary]);

  const toggleExpand = (qId: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const filteredQuestions = questions.filter((q) => {
    const gradedQ = q as unknown as { isCorrect?: boolean; selectedOption?: number | null };
    const userAns = selectedOptions[q.id] ?? (gradedQ.selectedOption !== null ? gradedQ.selectedOption : undefined);
    const isCorrect = gradedQ.isCorrect !== undefined ? gradedQ.isCorrect : userAns === q.correctOption;
    const isMarked = !!markedForReview[q.id];

    if (filterType === 'correct') return isCorrect;
    if (filterType === 'incorrect') return userAns !== undefined && !isCorrect;
    if (filterType === 'marked') return isMarked;
    return true;
  });

  return (
    <main
      id="main-content"
      role="main"
      tabIndex={-1}
      aria-label="Examination Diagnostic and Performance Report"
      className="max-w-5xl mx-auto p-3 sm:p-6 lg:p-8 outline-none text-theme-text"
    >
      {/* Header Banner */}
      <section aria-labelledby="report-main-title" className="bg-theme-surface border-2 border-theme-border rounded-xl p-4 sm:p-8 mb-6 shadow-sm">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-8 h-8 text-theme-focus-ring" aria-hidden="true" />
              <h2 id="report-main-title" className="text-2xl sm:text-3xl font-black">
                {report.examTitle} Diagnostic Report
              </h2>
            </div>
            <p className="text-sm sm:text-base text-theme-text-secondary mt-1">
              Comprehensive performance diagnostic, section-wise analysis, and question breakdown.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={returnToCatalog}
              className="px-4 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-surface hover:border-theme-primary text-theme-text flex items-center gap-1.5 transition text-sm focus:ring-4 focus:ring-theme-focus"
              aria-label="Return to Exam Catalog to choose another examination"
            >
              <span>📚</span>
              <span>Choose Another Exam</span>
            </button>

            <button
              type="button"
              onClick={handleReadSummary}
              className="px-4 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-bg hover:bg-theme-surface flex items-center gap-1.5 transition text-sm"
              aria-label="Read diagnostic summary aloud via TTS"
            >
              <Volume2 className="w-4 h-4 text-theme-focus-ring" aria-hidden="true" />
              <span>Read Summary</span>
            </button>

            <button
              type="button"
              onClick={() => openFeedbackModal(true)}
              className={`px-4 py-2 font-bold rounded-lg border-2 border-theme-border flex items-center gap-1.5 transition text-sm ${
                feedback.isSubmitted
                  ? 'bg-amber-400/10 text-amber-500 border-amber-400/40'
                  : 'bg-theme-bg hover:bg-theme-surface text-theme-text'
              }`}
              aria-label="Give exam feedback (Shortcut: F)"
            >
              <MessageSquare className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>{feedback.isSubmitted ? `Feedback (${feedback.rating}★)` : 'Exam Feedback'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-bg hover:bg-theme-surface flex items-center gap-1.5 transition text-sm"
              aria-label="Print or save diagnostic report"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Print / Save</span>
            </button>

            <button
              type="button"
              onClick={resetExam}
              className="px-4 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-primary text-theme-primary-text hover:brightness-110 flex items-center gap-1.5 transition text-sm"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Retake Examination</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6">
          <div className="p-4 rounded-lg border-2 border-theme-border bg-theme-bg">
            <span className="text-xs uppercase font-bold text-theme-text-secondary block">
              Overall Score
            </span>
            <div className="text-2xl sm:text-3xl font-black mt-1">
              {Number(report.totalScore.toFixed(2))} <span className="text-sm font-normal text-theme-text-secondary">/ {report.maxScore}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg border-2 border-theme-border bg-theme-bg">
            <span className="text-xs uppercase font-bold text-theme-text-secondary block">
              Accuracy Rate
            </span>
            <div className="text-2xl sm:text-3xl font-black text-theme-primary mt-1">
              {report.scorePercentage}%
            </div>
          </div>

          <div className="p-4 rounded-lg border-2 border-theme-border bg-theme-bg">
            <span className="text-xs uppercase font-bold text-theme-text-secondary block">
              Correct / Attempted
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-500 mt-1">
              {report.correctCount} <span className="text-sm font-normal text-theme-text-secondary">/ {report.attemptedCount}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg border-2 border-theme-border bg-theme-bg">
            <span className="text-xs uppercase font-bold text-theme-text-secondary block">
              Unattempted
            </span>
            <div className="text-2xl sm:text-3xl font-black text-amber-500 mt-1">
              {report.unattemptedCount}
            </div>
          </div>
        </div>

        {/* Verbalized Diagnostic Summary (Prompt Requirement 2) */}
        <section aria-labelledby="verbal-summary-heading" className="mt-6 p-5 rounded-lg border-2 border-theme-border bg-theme-bg">
          <h3 id="verbal-summary-heading" className="text-lg font-bold flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-theme-focus-ring" aria-hidden="true" />
            <span>Verbalized Diagnostic Summary</span>
          </h3>
          <ul className="space-y-2 list-disc list-inside text-sm sm:text-base leading-relaxed">
            {report.verbalSummary.map((item, idx) => (
              <li key={idx} className="text-theme-text">
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Candidate Exam Feedback Card / Callout */}
        <section aria-label="Examination Feedback" className="mt-6">
          {feedback.isSubmitted ? (
            <div className="p-4 sm:p-5 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                  <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-theme-text flex items-center gap-2">
                    <span>Feedback Recorded</span>
                    <span className="text-amber-400 font-black text-sm">
                      {'★'.repeat(feedback.rating)}
                      <span className="text-xs text-theme-text-secondary ml-1.5 font-bold">({feedback.rating}/5 Stars)</span>
                    </span>
                  </h4>
                  <p className="text-xs sm:text-sm text-theme-text-secondary mt-0.5">
                    Thank you! Your feedback helps us continuously improve accessibility for all students.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openFeedbackModal(true)}
                className="px-4 py-2 rounded-lg border-2 border-theme-border bg-theme-surface hover:bg-theme-bg text-xs font-bold transition flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Edit Feedback</span>
              </button>
            </div>
          ) : (
            <div className="p-4 sm:p-5 rounded-xl border-2 border-theme-primary/30 bg-theme-primary/5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-theme-primary/10 text-theme-primary border border-theme-primary/20">
                  <Sparkles className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-theme-text">
                    How was your examination experience?
                  </h4>
                  <p className="text-xs sm:text-sm text-theme-text-secondary mt-0.5">
                    Rate from 1 to 5 stars, select quick tags, or dictate thoughts using voice (Press F or say "Rating 5").
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openFeedbackModal(true)}
                className="px-5 py-2.5 rounded-xl bg-theme-primary text-theme-primary-text text-xs sm:text-sm font-bold hover:brightness-110 transition shadow-md flex items-center gap-2"
              >
                <Star className="w-4 h-4 fill-amber-300 stroke-amber-300" aria-hidden="true" />
                <span>Rate & Share Feedback</span>
              </button>
            </div>
          )}
        </section>
      </section>

      {/* Screen-Reader Friendly Data Table (Prompt Requirement 1) */}
      <section aria-labelledby="section-table-heading" className="bg-theme-surface border-2 border-theme-border rounded-xl p-6 sm:p-8 mb-6 shadow-sm">
        <h3 id="section-table-heading" className="text-xl font-bold mb-4">
          Section-Wise Performance Breakdown
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border-2 border-theme-border text-sm sm:text-base">
            <caption className="sr-only">
              Section-wise breakdown of exam performance showing total questions, attempted questions, correct questions, and percentage accuracy.
            </caption>
            <thead>
              <tr className="bg-theme-bg border-b-2 border-theme-border">
                <th scope="col" className="p-3.5 font-bold border-r border-theme-border">
                  Exam Section
                </th>
                <th scope="col" className="p-3.5 font-bold text-center border-r border-theme-border">
                  Total
                </th>
                <th scope="col" className="p-3.5 font-bold text-center border-r border-theme-border">
                  Attempted
                </th>
                <th scope="col" className="p-3.5 font-bold text-center border-r border-theme-border">
                  Correct
                </th>
                <th scope="col" className="p-3.5 font-bold text-right">
                  Accuracy (%)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {report.sectionDiagnostics.map((sec) => (
                <tr key={sec.section} className="hover:bg-theme-bg/60">
                  <th scope="row" className="p-3.5 font-bold border-r border-theme-border">
                    {sec.section}
                  </th>
                  <td className="p-3.5 text-center border-r border-theme-border">
                    {sec.total}
                  </td>
                  <td className="p-3.5 text-center border-r border-theme-border">
                    {sec.attempted}
                  </td>
                  <td className="p-3.5 text-center border-r border-theme-border font-bold text-emerald-500">
                    {sec.correct}
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-theme-primary">
                    {sec.accuracy}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Question-by-Question Detailed Review */}
      <section aria-labelledby="review-heading" className="bg-theme-surface border-2 border-theme-border rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h3 id="review-heading" className="text-xl font-bold">
            Question-by-Question Solution Review
          </h3>

          {/* Filter Tabs */}
          <div role="tablist" aria-label="Review filter tabs" className="flex flex-wrap gap-1.5 p-1 rounded-lg border-2 border-theme-border bg-theme-bg">
            <button
              role="tab"
              type="button"
              aria-selected={filterType === 'all'}
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs sm:text-sm font-bold rounded transition ${
                filterType === 'all'
                  ? 'bg-theme-primary text-theme-primary-text'
                  : 'text-theme-text hover:bg-theme-surface'
              }`}
            >
              All ({questions.length})
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={filterType === 'correct'}
              onClick={() => setFilterType('correct')}
              className={`px-3 py-1 text-xs sm:text-sm font-bold rounded transition ${
                filterType === 'correct'
                  ? 'bg-emerald-600 text-white'
                  : 'text-theme-text hover:bg-theme-surface'
              }`}
            >
              Correct ({report.correctCount})
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={filterType === 'incorrect'}
              onClick={() => setFilterType('incorrect')}
              className={`px-3 py-1 text-xs sm:text-sm font-bold rounded transition ${
                filterType === 'incorrect'
                  ? 'bg-red-600 text-white'
                  : 'text-theme-text hover:bg-theme-surface'
              }`}
            >
              Incorrect ({report.incorrectCount})
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={filterType === 'marked'}
              onClick={() => setFilterType('marked')}
              className={`px-3 py-1 text-xs sm:text-sm font-bold rounded transition ${
                filterType === 'marked'
                  ? 'bg-amber-500 text-black'
                  : 'text-theme-text hover:bg-theme-surface'
              }`}
            >
              Marked ({report.markedCount})
            </button>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {filteredQuestions.map((q) => {
            const gradedQ = q as unknown as { isCorrect?: boolean; selectedOption?: number | null };
            const userAnsNum = selectedOptions[q.id] ?? (gradedQ.selectedOption !== null ? gradedQ.selectedOption : undefined);
            const isAnswered = userAnsNum !== undefined;
            const isCorrect = gradedQ.isCorrect !== undefined ? gradedQ.isCorrect : userAnsNum === q.correctOption;
            const isMarked = !!markedForReview[q.id];
            const isExpanded = !!expandedQuestions[q.id];

            const userOptObj = q.options.find((o) => o.number === userAnsNum);
            const correctOptObj = q.options.find((o) => o.number === q.correctOption);

            return (
              <article
                key={q.id}
                aria-labelledby={`q-rev-title-${q.id}`}
                className={`p-4 sm:p-5 rounded-lg border-2 transition ${
                  !isAnswered
                    ? 'border-theme-border bg-theme-bg/60'
                    : isCorrect
                    ? 'border-emerald-600 bg-emerald-500/5'
                    : 'border-red-600 bg-red-500/5'
                }`}
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-theme-bg border border-theme-border">
                        {q.section}
                      </span>
                      {isCorrect && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border border-emerald-600 bg-emerald-600/20 text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Correct (+{marksPerQ})</span>
                        </span>
                      )}
                      {isAnswered && !isCorrect && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border border-red-600 bg-red-600/20 text-red-700 dark:text-red-400 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Incorrect {penaltyValue ? `(-${penaltyValue})` : '(No penalty)'}</span>
                        </span>
                      )}
                      {!isAnswered && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border border-slate-500 bg-slate-500/20 text-slate-700 dark:text-slate-300">
                          Unattempted (0)
                        </span>
                      )}
                      {isMarked && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-300 flex items-center gap-1">
                          <Bookmark className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                          <span>Was Marked</span>
                        </span>
                      )}
                    </div>

                    <h4 id={`q-rev-title-${q.id}`} className="text-base sm:text-lg font-bold">
                      Q{q.questionNumber}. {q.questionText}
                    </h4>

                    {q.mathLatex && (
                      <div className="my-2 p-2 rounded bg-theme-bg border border-theme-border inline-block">
                        <MathEquation latex={q.mathLatex} displayMode={true} />
                      </div>
                    )}

                    {/* Interactive Data Sonification Graph in Review Mode */}
                    {q.graph && q.graph.enabled && (
                      <InteractiveSonificationGraph graph={q.graph} isStudentMode={false} />
                    )}

                    {/* AI Diagram Viewer in Review Mode */}
                    <AiDiagramViewer question={q} />
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(q.id)}
                    aria-expanded={isExpanded}
                    className="p-2 rounded border border-theme-border bg-theme-bg hover:bg-theme-surface transition flex items-center gap-1 text-xs font-bold"
                  >
                    <span>{isExpanded ? 'Hide Solution' : 'View Solution'}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {/* Answer Summary Block */}
                <div className="mt-3 pt-3 border-t border-theme-border flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-theme-text-secondary">Your Answer: </span>
                    <strong className={isCorrect ? 'text-emerald-500' : 'text-red-500'}>
                      {userOptObj ? `Option ${userAnsNum} (${userOptObj.text})` : 'None (Unattempted)'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-theme-text-secondary">Correct Answer: </span>
                    <strong className="text-emerald-500">
                      Option {q.correctOption} ({correctOptObj?.text})
                    </strong>
                  </div>
                </div>

                {/* Expandable Explanation */}
                {isExpanded && (
                  <div className="mt-3 p-4 rounded-lg bg-theme-bg border-2 border-theme-border space-y-2 text-sm sm:text-base">
                    <strong className="block text-theme-focus-ring font-bold">
                      Step-by-Step Explanation:
                    </strong>
                    <p className="leading-relaxed">{q.explanation}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};
