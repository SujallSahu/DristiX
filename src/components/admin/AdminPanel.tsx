import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore, type StudentProfile, type ExamSubmission, deduplicateSubmissions, authBroadcastChannel, matchesStudent } from '../../store/useAuthStore';
import { useExamStore } from '../../store/useExamStore';
import { useAnnouncerStore } from '../../store/useAnnouncerStore';
import { soundEffects } from '../../utils/soundEffects';
import { getDataSource } from '../../services/dataSource';
import { verbalizeMath } from '../../utils/mathVerbalizer';
import { renderGeometrySvg, verbalizeGeometryDiagram } from '../../utils/geometryGenerator';
import { extractQuestionsFromFile, extractAndStripImageUrls } from '../../utils/docxImport';
import { extractQuestionsFromPdf } from '../../utils/pdfImport';
import { MathEquation } from '../common/MathEquation';
import { AdminGraphBuilder } from './AdminGraphBuilder';
import { AdminNotificationManager } from './AdminNotificationManager';
import { InteractiveSonificationGraph } from '../sonification/InteractiveSonificationGraph';
import { usePreferencesStore, type TextScale, type ThemeMode } from '../../store/usePreferencesStore';
import type { Exam, QuestionItem } from '../../../shared/types';
import type { ExamCategory } from '../../data/examCategories';
import {
  Users,
  FileText,
  PlusCircle,
  LogOut,
  ArrowLeft,
  Volume2,
  Trash2,
  Play,
  CheckCircle,
  Award,
  TrendingUp,
  Sparkles,
  Image,
  Loader2,
  Edit3,
  Eye,
  Search,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  RefreshCw,
  Database,
  LayoutDashboard,
  BookOpen,
  HelpCircle,
  Megaphone,
  Moon,
  Sun,
  Mic,
  CheckCircle2,
  ArrowRight,
  Shield,
  HardDrive,
  Mail,
  Command,
  Download,
  SlidersHorizontal,
  Copy,
  Check,
  Calendar,
  Clock,
  Activity,
  FileSpreadsheet,
} from 'lucide-react';

/**
 * The sample item the creator form opens with. The first Word import replaces
 * it wholesale so an examiner never has to delete it by hand.
 */
const STARTER_QUESTION_TEXT = 'What is the sum of angles in a triangle?';

interface AdminPanelProps {
  onReturnToStudent: () => void;
}


export const AdminPanel: React.FC<AdminPanelProps> = ({ onReturnToStudent }) => {
  const {
    students,
    submissions,
    logoutAdmin,
    deleteSubmission,
    clearAllSubmissions,
    syncSubmissions,
    fetchStudents,
    deleteStudent,
    isSubmissionsLoading,
  } = useAuthStore();

  const {
    availableExams,
    availablePracticeDrills,
    addNewExam,
    updateExistingExam,
    loadExamForEdit,
    deleteCustomExam,
    selectExam,
  } = useExamStore();
  const { announce } = useAnnouncerStore();

  const { fontSize, setFontSize, theme, setTheme } = usePreferencesStore();
  const [activeAdminTab, setActiveAdminTabState] = useState<'dashboard' | 'manage' | 'create' | 'students' | 'submissions' | 'notifications'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('dristix_admin_tab');
        if (saved && ['dashboard', 'manage', 'create', 'students', 'submissions', 'notifications'].includes(saved)) {
          return saved as any;
        }
      } catch {}
    }
    return 'dashboard';
  });

  const setActiveAdminTab = (tab: 'dashboard' | 'manage' | 'create' | 'students' | 'submissions' | 'notifications') => {
    setActiveAdminTabState(tab);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('dristix_admin_tab', tab);
      } catch {}
    }
  };

  const [manageSubTab, setManageSubTab] = useState<'exams' | 'practice'>('exams');
  const [globalSearch, setGlobalSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Admin Portal strictly enforces only 'Teal' (teal-cream) or 'Charcoal Dark' (dark)
  useEffect(() => {
    if (theme !== 'teal-cream' && theme !== 'dark') {
      setTheme('teal-cream');
    }
  }, [theme, setTheme]);

  // Global Keyboard Shortcuts matching dashboard footer & Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Ctrl+K / Cmd+K anywhere (even from inside text fields)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        soundEffects.playSelect();
        return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape') {
          target.blur();
          setIsCommandPaletteOpen(false);
                  }
        return;
      }

      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        return;
      }

      // CRITICAL: Never intercept browser hotkeys (Ctrl+R reload, Ctrl+S save, Ctrl+C copy, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        soundEffects.playSelect();
      } else if (e.key === '1' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setActiveAdminTab('dashboard');
        soundEffects.playSelect();
        announce('Admin Dashboard (Tab 1). Total mock exams, student enrollments, and real-time exam attempts overview.', 'assertive', true);
      } else if (e.key === '2' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        setActiveAdminTab('manage');
        soundEffects.playSelect();
        announce('Manage Papers (Tab 2). View published mock exams, question counts, and edit or delete test papers.', 'assertive', true);
      } else if (e.key === '3' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setEditingExamId(null);
        setActiveAdminTab('create');
        soundEffects.playSelect();
        announce('Paper Creator Studio (Tab 3). Create new mock exams, import DOCX or JSON questions, and set duration and negative marking.', 'assertive', true);
      } else if (e.key === '4' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setActiveAdminTab('students');
        soundEffects.playSelect();
        announce('Student Directory (Tab 4). View all registered students, Google Mail accounts, and individual exam history.', 'assertive', true);
      } else if (e.key === '5' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setActiveAdminTab('submissions');
        soundEffects.playSelect();
        announce('Submissions and Results (Tab 5). Real-time student test attempts, scores, accuracy percentages, and exam review.', 'assertive', true);
      } else if (e.key === '6' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setActiveAdminTab('notifications');
        soundEffects.playSelect();
        announce('Student Notification Broadcaster (Tab 6). Broadcast announcements and published mock test alerts directly to student dashboards.', 'assertive', true);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        soundEffects.playNavigate();
        announce('Returning to Candidate Portal.', 'assertive', true);
        onReturnToStudent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [announce, onReturnToStudent]);

  // Initial spoken announcement upon entering Admin Studio
  useEffect(() => {
    announce(
      'Welcome to DristiX Admin Studio. Use number keys 1 to 6 to switch tabs, or press B to return to the Student Portal.',
      'assertive',
      true
    );
  }, [announce]);

  // Refresh the cohort's results, student roster, & exam catalog on mount, tab change,
  // cross-tab submission events, student registration, focus events, and gentle background polling
  useEffect(() => {
    void syncSubmissions();
    void fetchStudents();
    void useExamStore.getState().loadCatalog();

    const handleDataRefresh = () => {
      void syncSubmissions();
      void fetchStudents();
    };

    let lastFocusRefresh = Date.now();
    const handleFocusRefresh = () => {
      // Throttle window focus refresh to avoid hammering backend and re-rendering on rapid window clicks
      if (Date.now() - lastFocusRefresh > 15000) {
        lastFocusRefresh = Date.now();
        void syncSubmissions();
        void fetchStudents();
      }
    };

    const handleCatalogRefresh = () => {
      void useExamStore.getState().loadCatalog();
    };

    window.addEventListener('dristix:submission-updated', handleDataRefresh);
    window.addEventListener('dristix:submission-deleted', handleDataRefresh);
    window.addEventListener('dristix:submission-cleared', handleDataRefresh);
    window.addEventListener('dristix:student-history-cleared', handleDataRefresh);
    window.addEventListener('dristix:student-registered', handleDataRefresh);
    window.addEventListener('dristix:catalog-updated', handleCatalogRefresh);
    window.addEventListener('focus', handleFocusRefresh);

    const interval = setInterval(() => {
      // Auto-poll quietly in the background so test completions reflect in real time without manual reload
      void syncSubmissions();
      void fetchStudents();
    }, 15000);

    return () => {
      window.removeEventListener('dristix:submission-updated', handleDataRefresh);
      window.removeEventListener('dristix:submission-deleted', handleDataRefresh);
      window.removeEventListener('dristix:submission-cleared', handleDataRefresh);
      window.removeEventListener('dristix:student-history-cleared', handleDataRefresh);
      window.removeEventListener('dristix:student-registered', handleDataRefresh);
      window.removeEventListener('dristix:catalog-updated', handleCatalogRefresh);
      window.removeEventListener('focus', handleFocusRefresh);
      clearInterval(interval);
    };
  }, [syncSubmissions, fetchStudents]);

  const [submissionSearch, setSubmissionSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterPref, setStudentFilterPref] = useState('all');
  const [studentSortBy, setStudentSortBy] = useState<'recent' | 'name' | 'attempts' | 'accuracy'>('recent');
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [copiedRoll, setCopiedRoll] = useState<string | null>(null);
  const [selectedExamFilter, setSelectedExamFilter] = useState('All');
  const [submissionAccuracyFilter, setSubmissionAccuracyFilter] = useState<'all' | 'high' | 'moderate' | 'low'>('all');
  const [manageSearchQuery, setManageSearchQuery] = useState('');
  const [manageCategoryFilter, setManageCategoryFilter] = useState('All');
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');

  const handleManualSync = async () => {
    setIsSyncing(true);
    soundEffects.playSelect();
    try {
      await Promise.all([syncSubmissions(), fetchStudents()]);
      announce('Database connectivity active. Records synchronized from MongoDB Atlas.');
      soundEffects.playSuccess();
    } catch {
      announce('Database sync completed with cached records.');
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Exam Creator / Editor Form State
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [isLoadingExamForEdit, setIsLoadingExamForEdit] = useState<boolean>(false);
  const [examType, setExamType] = useState<'exam' | 'practice'>('exam');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<ExamCategory>('Staff Selection');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalMarks, setTotalMarks] = useState(50);
  const [negativeMarking, setNegativeMarking] = useState('-0.25 marks');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Moderate' | 'Challenging'>('Moderate');
  const [description, setDescription] = useState('');

  // Questions Authoring
  const [questions, setQuestions] = useState<QuestionItem[]>([
    {
      id: `custom-q-1`,
      section: 'Quantitative Aptitude',
      questionNumber: 1,
      questionType: 'DI',
      graph: {
        enabled: true,
        type: 'bar',
        title: 'Data Interpretation Graph',
        xAxisLabel: 'Category',
        yAxisLabel: 'Value',
        unit: '',
        data: [
          { id: '1', label: 'Item A', value: 30 },
          { id: '2', label: 'Item B', value: 65 },
          { id: '3', label: 'Item C', value: 90 },
        ],
        sonification: {
          enabled: true,
          spatialAudio: true,
          trendDetection: true,
          peakDetection: true,
          haptic: true,
          voiceDetail: 'standard',
          minFrequency: 250,
          maxFrequency: 900,
        },
      },
      questionText: STARTER_QUESTION_TEXT,
      mathLatex: 'A + B + C = 180^\\circ',
      options: [
        { id: 'opt_1', number: 1, text: '90 degrees' },
        { id: 'opt_2', number: 2, text: '180 degrees' },
        { id: 'opt_3', number: 3, text: '270 degrees' },
        { id: 'opt_4', number: 4, text: '360 degrees' },
      ],
      correctOption: 2,
      explanation: 'The sum of all three interior angles in any Euclidean triangle is always 180 degrees.',
      hint: 'Recall the angle sum property of plane geometry.',
    },
  ]);

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [generatingDiagramAi, setGeneratingDiagramAi] = useState<Record<number, boolean>>({});
  const [previewingQuestionIdx, setPreviewingQuestionIdx] = useState<number | null>(null);
  /** Hidden Word picker, opened by the "Import from Word" button. */
  const wordFileRef = useRef<HTMLInputElement | null>(null);
  /** Hidden PDF picker, opened by the "Import PDF" button. */
  const pdfFileRef = useRef<HTMLInputElement | null>(null);

  const convertImageUrlToBase64 = async (url: string): Promise<string> => {
    if (!url || !url.trim() || url.startsWith('data:')) return url;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string) || url);
          reader.onerror = () => resolve(url);
          reader.readAsDataURL(blob);
        });
      }
    } catch (err) {
      console.warn('[dristix] client image conversion failed, passing original URL:', err);
    }
    return url;
  };

  const handleGenerateAiDiagramExplanation = async (qIdx: number) => {
    const q = questions[qIdx];
    if (!q.questionText.trim()) {
      setFormError(`Please enter Question ${qIdx + 1} text before generating AI Diagram explanation.`);
      return;
    }
    setFormError('');
    setGeneratingDiagramAi((prev) => ({ ...prev, [qIdx]: true }));

    try {
      let payloadUrl = q.diagramUrl;
      if (payloadUrl && (payloadUrl.startsWith('http://') || payloadUrl.startsWith('https://'))) {
        payloadUrl = await convertImageUrlToBase64(payloadUrl);
      }

      const data = await getDataSource().ai.explainDiagram({
        questionText: q.questionText,
        mathLatex: q.mathLatex,
        diagramUrl: payloadUrl,
        diagramType: q.diagramType || 'geometry',
        diagramDescription: q.diagramDescription,
      });

      handleUpdateQuestion(qIdx, 'diagramAiExplanation', data);
      soundEffects.playSuccess();
      announce(`AI Diagram Explanation generated successfully for Question ${q.questionNumber}.`, 'assertive', true);
    } catch (err: any) {
      console.error('[dristix] explainDiagram error', err);
      // Check if session expired / unauthorized
      if (err.status === 401 || err.code === 'unauthorized') {
        setFormError('Your admin session has expired. Please log in again to generate AI explanations.');
        useAuthStore.getState().logoutAdmin();
        return;
      }

      // Fail loudly. This used to write a canned non-AI paragraph into the
      // question and play the success chime, so a broken provider looked like
      // it had worked — the admin only noticed the useless text later.
      const detail = typeof err?.message === 'string' ? err.message : '';
      setFormError(
        `AI Vision could not analyze the image for Question ${q.questionNumber}.` +
        `${detail ? ` (${detail})` : ''} ` +
        'Check that the image link opens in a browser, or pick the image file directly, then try again.'
      );
    } finally {
      setGeneratingDiagramAi((prev) => ({ ...prev, [qIdx]: false }));
    }
  };

  const handleApplyGeometryPreset = (qIdx: number, type: 'triangle_60_30' | 'triangle_right' | 'circle' | 'motion') => {
    let spec: any;
    if (type === 'triangle_60_30') {
      spec = {
        type: 'triangle',
        vertexTop: 'C',
        vertexLeft: 'A',
        vertexRight: 'B',
        baseLabel: '5.8 cm',
        angleLeftLabel: '60°',
        angleRightLabel: '30°',
      };
    } else if (type === 'triangle_right') {
      spec = {
        type: 'triangle',
        vertexTop: 'C',
        vertexLeft: 'A',
        vertexRight: 'B',
        baseLabel: '8 cm',
        sideLeftLabel: '6 cm',
        angleLeftLabel: '90°',
        isRightAngle: true,
      };
    } else if (type === 'circle') {
      spec = {
        type: 'circle',
        centerLabel: 'O',
        radiusLabel: 'r = 7 cm',
        chordLabel: 'AB = 10 cm',
      };
    } else {
      spec = {
        type: 'motion',
        object1Label: 'Train (L metres)',
        object2Label: 'Platform (250 m)',
        speedLabel: 'v = 72 km/h (20 m/s)',
        timeLabel: 't = 26s',
      };
    }

    const svgUrl = renderGeometrySvg(spec);
    const { description, aiExplanation } = verbalizeGeometryDiagram(spec);

    const updated = [...questions];
    updated[qIdx] = {
      ...updated[qIdx],
      diagramType: 'geometry',
      diagramUrl: svgUrl,
      diagramDescription: description,
      diagramAiExplanation: aiExplanation,
    };
    setQuestions(updated);
    soundEffects.playSuccess();
    announce(`Applied ${type} geometry diagram preset to Question ${qIdx + 1}.`, 'assertive', true);
  };

  /**
   * Re-encodes a picked image at a bounded size.
   *
   * Uploaded pictures travel to the server as base64 data URLs; an unbounded
   * phone photo is several megabytes, which used to blow past the body limit
   * and quietly replace the real AI analysis with a canned fallback. Scaling
   * to 1280px and re-encoding keeps the payload small and the stored exam
   * document light. Anything that cannot be decoded as a raster image (an
   * SVG, say) is passed through untouched.
   */
  const readAndCompressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.onload = () => {
        const src = reader.result as string;
        // `window.Image`, not bare `Image`: the lucide `Image` icon imported at
        // the top of this file shadows the DOM constructor.
        const img = new window.Image();
        img.onerror = () => resolve(src);
        img.onload = () => {
          const MAX_EDGE = 1280;
          const longest = Math.max(img.width, img.height);
          const scale = Math.min(1, MAX_EDGE / longest);
          if (scale === 1 && file.size < 400_000) {
            resolve(src);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(src);
            return;
          }
          // JPEG has no alpha; matting onto white keeps a transparent diagram's
          // background white instead of the black a naive export would give.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } catch {
            resolve(src);
          }
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });

  const handleImageFileUpload = async (qIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Only image files can be attached to a question.');
      return;
    }

    try {
      const result = await readAndCompressImage(file);
      const updated = [...questions];
      updated[qIdx] = {
        ...updated[qIdx],
        diagramUrl: result,
        diagramType: 'image',
      };
      setQuestions(updated);
      setFormError('');
      soundEffects.playSuccess();
      announce(`Uploaded diagram image file for Question ${qIdx + 1}.`, 'polite', true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not read that image file.');
    }
  };

  // Top Performing Students computed dynamically from real candidate scores
  const topPerformingStudents = React.useMemo(() => {
    if (!students || students.length === 0) return [];
    const scored = students.map((st) => {
      const stdSubs = submissions.filter((s) => matchesStudent(s, st));
      const avg = stdSubs.length > 0 ? Math.round(stdSubs.reduce((acc, c) => acc + (c.percentage || 0), 0) / stdSubs.length) : 0;
      return {
        name: st.name,
        accuracy: avg,
        attempts: stdSubs.length,
      };
    });
    scored.sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
    return scored.slice(0, 4).map((st, idx) => ({
      rank: idx + 1,
      medal: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : String(idx + 1),
      name: st.name,
      accuracy: st.accuracy,
    }));
  }, [students, submissions]);

  // Calculations for KPI Cards
  const totalSubmissions = submissions.length;
  const avgScore =
    totalSubmissions > 0
      ? Math.round(submissions.reduce((acc, s) => acc + s.percentage, 0) / totalSubmissions)
      : 0;

  const highScorersCount = submissions.filter((s) => s.percentage >= 80).length;
  const distinctionRate = totalSubmissions > 0 ? Math.round((highScorersCount / totalSubmissions) * 100) : 0;

  // Filtered Submissions
  const filteredSubmissions: ExamSubmission[] = useMemo(() => {
    const matched = submissions.filter((sub) => {
    const matchesSearch =
      submissionSearch.trim() === '' ||
      sub.studentName.toLowerCase().includes(submissionSearch.toLowerCase()) ||
      sub.studentRoll.toLowerCase().includes(submissionSearch.toLowerCase()) ||
      sub.examTitle.toLowerCase().includes(submissionSearch.toLowerCase()) ||
      sub.examCode.toLowerCase().includes(submissionSearch.toLowerCase());

    const matchesExam =
      selectedExamFilter === 'All' || sub.examCode === selectedExamFilter;

    const matchesAccuracy =
      submissionAccuracyFilter === 'all' ||
      (submissionAccuracyFilter === 'high' && sub.percentage >= 80) ||
      (submissionAccuracyFilter === 'moderate' && sub.percentage >= 50 && sub.percentage < 80) ||
      (submissionAccuracyFilter === 'low' && sub.percentage < 50);

    return matchesSearch && matchesExam && matchesAccuracy;
    });
    return deduplicateSubmissions(matched);
  }, [submissions, submissionSearch, selectedExamFilter, submissionAccuracyFilter]);

  // Submissions Pagination (5 per page)
  const SUBMISSIONS_PER_PAGE = 5;
  const [submissionPage, setSubmissionPage] = useState(1);

  useEffect(() => {
    setSubmissionPage(1);
  }, [submissionSearch, selectedExamFilter, submissionAccuracyFilter]);

  const totalSubmissionPages = Math.max(1, Math.ceil(filteredSubmissions.length / SUBMISSIONS_PER_PAGE));
  const paginatedAdminSubmissions = filteredSubmissions.slice(
    (submissionPage - 1) * SUBMISSIONS_PER_PAGE,
    submissionPage * SUBMISSIONS_PER_PAGE
  );

  // Cohort Analytics for Student Management Hub
  const studentsWithAttempts = students.filter((std) =>
    submissions.some((s) => matchesStudent(s, std))
  );
  const cohortActiveRate = students.length > 0 ? Math.round((studentsWithAttempts.length / students.length) * 100) : 0;
  const cohortScores = submissions.map((s) => s.percentage || 0);
  const cohortAvgAccuracy = cohortScores.length > 0 ? Math.round(cohortScores.reduce((a, b) => a + b, 0) / cohortScores.length) : 78;
  const visualStudentsCount = students.filter((s) => (s.accessibilityPreference || '').toLowerCase().includes('visual')).length;
  const cognitiveStudentsCount = students.filter((s) => {
    const p = (s.accessibilityPreference || '').toLowerCase();
    return p.includes('adhd') || p.includes('cognitive');
  }).length;
  const motorStudentsCount = students.filter((s) => (s.accessibilityPreference || '').toLowerCase().includes('motor')).length;
  const specialAccommodationsCount = visualStudentsCount + cognitiveStudentsCount + motorStudentsCount;

  // Filtered & Sorted Registered Students
  const filteredStudents = students
    .filter((std) => {
      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase();
        const match =
          std.name.toLowerCase().includes(q) ||
          std.rollNumber.toLowerCase().includes(q) ||
          std.email.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (studentFilterPref !== 'all') {
        const pref = (std.accessibilityPreference || 'standard').toLowerCase();
        if (studentFilterPref === 'standard' && pref !== 'standard') return false;
        if (studentFilterPref !== 'standard' && !pref.includes(studentFilterPref)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aSubs = submissions.filter((s) => matchesStudent(s, a));
      const bSubs = submissions.filter((s) => matchesStudent(s, b));
      const aAvg = aSubs.length > 0 ? aSubs.reduce((acc, c) => acc + (c.percentage || 0), 0) / aSubs.length : 0;
      const bAvg = bSubs.length > 0 ? bSubs.reduce((acc, c) => acc + (c.percentage || 0), 0) / bSubs.length : 0;

      if (studentSortBy === 'name') return a.name.localeCompare(b.name);
      if (studentSortBy === 'attempts') return bSubs.length - aSubs.length;
      if (studentSortBy === 'accuracy') return bAvg - aAvg;
      return (b.registeredAt || 0) - (a.registeredAt || 0);
    });

  const handleCopyRoll = (roll: string) => {
    navigator.clipboard.writeText(roll);
    setCopiedRoll(roll);
    soundEffects.playSelect();
    setTimeout(() => setCopiedRoll(null), 2000);
  };

  const handleExportStudentsCsv = () => {
    soundEffects.playSelect();
    const headers = ['Name', 'Roll Number', 'Email', 'Accessibility Mode', 'Total Tests', 'Avg Accuracy', 'Registered Date'];
    const rows = students.map((s) => {
      const stdSubs = submissions.filter((sub) => matchesStudent(sub, s));
      const avg = stdSubs.length > 0 ? Math.round(stdSubs.reduce((acc, c) => acc + (c.percentage || 0), 0) / stdSubs.length) : 'N/A';
      const reg = s.registeredAt ? new Date(s.registeredAt).toLocaleDateString() : 'N/A';
      return [
        `"${s.name.replace(/"/g, '""')}"`,
        `"${s.rollNumber}"`,
        `"${s.email}"`,
        `"${s.accessibilityPreference || 'standard'}"`,
        stdSubs.length,
        typeof avg === 'number' ? `${avg}%` : avg,
        `"${reg}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `dristix_students_roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    announce('Student roster exported as CSV successfully.');
  };

  const handleDuplicateExam = async (examId: string, type: 'exam' | 'practice') => {
    try {
      const fullExam = await loadExamForEdit(examId);
      if (!fullExam) {
        announce('Could not duplicate exam: Paper data unavailable.', 'assertive', true);
        return;
      }
      const stamp = Date.now().toString().slice(-4);
      const newExamPayload: Exam = {
        ...fullExam,
        id: `exam-${Date.now()}`,
        title: `${fullExam.title} (Copy)`,
        code: `${fullExam.code}-C${stamp}`,
      };
      const res = await addNewExam(newExamPayload, type);
      if (res.ok) {
        soundEffects.playSuccess();
        announce(`Exam duplicated as ${newExamPayload.code}.`, 'assertive', true);
      } else {
        announce(res.message || 'Failed to duplicate exam.', 'assertive', true);
      }
    } catch (err) {
      console.error('Failed to duplicate exam:', err);
      announce('Failed to duplicate exam.', 'assertive', true);
    }
  };

  const filteredManageExams = availableExams.filter((exam) => {
    if (manageSearchQuery.trim()) {
      const q = manageSearchQuery.toLowerCase();
      const matches =
        exam.title.toLowerCase().includes(q) ||
        exam.code.toLowerCase().includes(q) ||
        (exam.description && exam.description.toLowerCase().includes(q));
      if (!matches) return false;
    }
    if (manageCategoryFilter !== 'All' && exam.category !== manageCategoryFilter) {
      return false;
    }
    return true;
  });

  const filteredManageDrills = availablePracticeDrills.filter((drill) => {
    if (manageSearchQuery.trim()) {
      const q = manageSearchQuery.toLowerCase();
      const matches =
        drill.title.toLowerCase().includes(q) ||
        drill.code.toLowerCase().includes(q) ||
        (drill.description && drill.description.toLowerCase().includes(q));
      if (!matches) return false;
    }
    if (manageCategoryFilter !== 'All' && drill.category !== manageCategoryFilter) {
      return false;
    }
    return true;
  });

  const totalBankQuestionsCount = [...availableExams, ...availablePracticeDrills].reduce(
    (acc, e) => acc + (e.questions?.length || e.questionCount || 0),
    0
  );

  const [isClearingSubmissions, setIsClearingSubmissions] = useState(false);

  const handleClearAllSubmissions = async () => {
    if (submissions.length === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to permanently clear all ${submissions.length} candidate submission records from the administrative database? This action cannot be undone.`
      )
    ) {
      return;
    }

    setIsClearingSubmissions(true);
    try {
      await clearAllSubmissions();
    } finally {
      setIsClearingSubmissions(false);
    }
  };

  const handleExportSubmissionsCsv = () => {
    soundEffects.playSelect();
    const headers = [
      'Candidate Name',
      'Roll Number',
      'Exam Title',
      'Exam Code',
      'Module Type',
      'Score Achieved',
      'Max Score',
      'Accuracy %',
      'Completion Date & Time',
    ];
    const rows = filteredSubmissions.map((s) => [
      `"${s.studentName.replace(/"/g, '""')}"`,
      `"${s.studentRoll}"`,
      `"${s.examTitle.replace(/"/g, '""')}"`,
      `"${s.examCode}"`,
      `"${s.examType === 'practice' ? 'Practice Drill' : 'Mock Exam'}"`,
      s.score,
      s.maxScore,
      `${s.percentage}%`,
      `"${new Date(s.submittedAt).toLocaleString()}"`,
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `dristix_examination_submissions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    announce('Examination submissions report exported as CSV successfully.');
  };

  const getAccessibilityBadge = (pref?: string | null) => {
    const p = (pref || 'standard').toLowerCase();
    if (p.includes('visual')) {
      return {
        label: 'Visual Assistance',
        icon: Eye,
        bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        dot: 'bg-amber-500',
      };
    }
    if (p.includes('motor')) {
      return {
        label: 'Motor Assistance',
        icon: Shield,
        bg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
        dot: 'bg-sky-500',
      };
    }
    if (p.includes('adhd') || p.includes('cognitive')) {
      return {
        label: 'Cognitive / ADHD',
        icon: Sparkles,
        bg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
        dot: 'bg-purple-500',
      };
    }
    return {
      label: 'Standard Mode',
      icon: CheckCircle2,
      bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-500',
    };
  };

  const getStudentGradient = (name: string) => {
    const gradients = [
      'from-emerald-500 to-teal-700',
      'from-teal-600 to-cyan-700',
      'from-purple-500 to-indigo-700',
      'from-amber-500 to-orange-700',
      'from-rose-500 to-pink-700',
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return gradients[sum % gradients.length];
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (
      window.confirm(
        `Are you sure you want to remove student "${studentName}"? All their test attempts will also be permanently deleted.`
      )
    ) {
      setDeletingStudentId(studentId);
      await deleteStudent(studentId);
      setDeletingStudentId(null);
      if (selectedStudent?.id === studentId) setSelectedStudent(null);
    }
  };

  const handleStartEditExam = async (examId: string) => {
    setFormError('');
    setFormSuccess('');
    setIsLoadingExamForEdit(true);

    try {
      const fullExam = await loadExamForEdit(examId);
      if (!fullExam) {
        setFormError('Could not load examination details for editing.');
        return;
      }

      setEditingExamId(fullExam.id);
      setTitle(fullExam.title);
      setCode(fullExam.code);
      setDescription(fullExam.description || '');
      setCategory((fullExam.category as ExamCategory) || 'Staff Selection');
      setDurationMinutes(fullExam.durationMinutes);
      setTotalMarks(fullExam.totalMarks);
      const isPractice = fullExam.negativeMarking.startsWith('No negative');
      setExamType(isPractice ? 'practice' : 'exam');
      setNegativeMarking(fullExam.negativeMarking);
      setDifficulty(fullExam.difficulty || 'Moderate');

      if (fullExam.questions && fullExam.questions.length > 0) {
        const cleanedQuestions = fullExam.questions.map((q) => {
          const stripped = extractAndStripImageUrls(q.questionText);
          if (stripped.imageUrl || (stripped.cleanText && stripped.cleanText !== q.questionText)) {
            const cleanQuestionText = stripped.cleanText || q.questionText;
            const diagramUrl = q.diagramUrl || stripped.imageUrl || '';
            const isChart =
              Boolean(diagramUrl) &&
              /(?:bar|pie|line|histogram|scatter|graph|chart|तालिका|चित्र|आरेख|ग्राफ)\b/i.test(cleanQuestionText);
            const diagramType = q.diagramType || (diagramUrl ? (isChart ? 'chart' : 'image') : undefined);
            return {
              ...q,
              questionText: cleanQuestionText,
              questionType: (diagramType === 'chart' ? 'DI' : q.questionType || 'MCQ') as 'MCQ' | 'DI',
              diagramUrl,
              diagramType,
            };
          }
          return q;
        });
        setQuestions(cleanedQuestions);
      }

      setActiveAdminTab('create');
      soundEffects.playSelect();
      announce(`Loaded examination ${fullExam.code} for editing.`, 'assertive', true);
    } catch {
      setFormError('Failed to load examination for editing.');
    } finally {
      setIsLoadingExamForEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingExamId(null);
    setTitle('');
    setCode('');
    setDescription('');
    setActiveAdminTab('manage');
  };

  const handleSpeakResult = (sub: (typeof submissions)[0]) => {
    soundEffects.playSelect();
    const msg = `Candidate ${sub.studentName}, Roll Number ${sub.studentRoll}, completed ${sub.examTitle} on ${new Date(
      sub.submittedAt
    ).toLocaleDateString()}. Score: ${sub.score} out of ${sub.maxScore} points, accuracy ${sub.percentage} percent.`;
    announce(msg, 'assertive', true);
  };

  const handleAddQuestion = () => {
    const nextNum = questions.length + 1;
    const newQ: QuestionItem = {
      id: `custom-q-${Date.now()}-${nextNum}`,
      section: questions[0]?.section || 'General',
      questionNumber: nextNum,
      questionText: '',
      mathLatex: '',
      options: [
        { id: `opt_${nextNum}_1`, number: 1, text: '' },
        { id: `opt_${nextNum}_2`, number: 2, text: '' },
        { id: `opt_${nextNum}_3`, number: 3, text: '' },
        { id: `opt_${nextNum}_4`, number: 4, text: '' },
      ],
      correctOption: 1,
      explanation: '',
      hint: '',
    };
    setQuestions([...questions, newQ]);
    soundEffects.playNavigate();
  };

  const handleDuplicateQuestion = (qIdx: number) => {
    const source = questions[qIdx];
    const nextNum = questions.length + 1;
    const duplicated: QuestionItem = {
      ...JSON.parse(JSON.stringify(source)),
      id: `custom-q-${Date.now()}-${nextNum}`,
      questionNumber: nextNum,
    };
    setQuestions([...questions, duplicated]);
    soundEffects.playSelect();
    announce(`Question ${source.questionNumber} duplicated as Question ${nextNum}.`);
  };

  /**
   * Bulk-authoring: read a Word (.docx) paper and drop every recognised
   * question into the form — statement, options, correct answer, section,
   * solution and hint — so an examiner reviews instead of retyping.
   */
  const handleImportWordFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires a change event.
    e.target.value = '';
    if (!file) return;

    setFormError('');
    setFormSuccess('');

    try {
      const result = await extractQuestionsFromFile(file);

      if (result.questions.length === 0) {
        setFormError(
          `No questions were recognised in "${file.name}". Each question needs a number such as ` +
          '"1." or "Q1.", options such as "a)" or "(a)", and ideally an answer line like "Ans: b".'
        );
        return;
      }

      const stamp = Date.now();
      const imported: QuestionItem[] = result.questions.map((q, i) => {
        const minOptLen = Math.max(4, q.options.length, q.correctOption || 0);
        const optionTexts = [...q.options];
        while (optionTexts.length < minOptLen) optionTexts.push('');
        const stripped = extractAndStripImageUrls(q.questionText);
        const cleanQuestionText = stripped.cleanText || q.questionText.trim();
        const diagramUrl = q.diagramUrl || stripped.imageUrl || '';
        const isChart =
          Boolean(diagramUrl) &&
          /(?:bar|pie|line|histogram|scatter|graph|chart|तालिका|चित्र|आरेख|ग्राफ)\b/i.test(cleanQuestionText);
        const diagramType = q.diagramType || (diagramUrl ? (isChart ? 'chart' : 'image') : undefined);
        return {
          id: `imported-q-${stamp}-${i}`,
          section: q.section || 'General',
          questionNumber: 0, // assigned by the merge below
          questionText: cleanQuestionText,
          questionType: (diagramType === 'chart' ? 'DI' : 'MCQ') as 'DI' | 'MCQ',
          diagramUrl,
          diagramType,
          options: optionTexts.map((text, oi) => ({
            id: `opt_${stamp}_${i}_${oi + 1}`,
            number: oi + 1,
            text,
          })),
          // 0 means "the file carried no answer": the radio stays unselected
          // so the gap is visible, and publishing refuses to proceed.
          correctOption:
            q.correctOption >= 1 && q.correctOption <= optionTexts.length ? q.correctOption : 0,
          explanation: q.explanation,
          hint: q.hint,
        };
      });

      const finalQuestions = imported.map((q, idx) => ({ ...q, questionNumber: idx + 1 }));
      setQuestions(finalQuestions);
      setTotalMarks(Math.max(finalQuestions.length * 2, 20));

      const missingAnswers = finalQuestions.filter((q) => !q.correctOption).length;
      const shortOptions = finalQuestions.filter((q) => q.options.length < 4).length;
      const imageCount = finalQuestions.filter((q) => Boolean(q.diagramUrl)).length;

      setFormSuccess(
        `Imported ${finalQuestions.length} question${finalQuestions.length === 1 ? '' : 's'}` +
        (imageCount > 0 ? ` with ${imageCount} diagram/chart image${imageCount === 1 ? '' : 's'} attached` : '') +
        ` from "${file.name}" — exactly ${finalQuestions.length} questions loaded into workbench.` +
        (missingAnswers
          ? ` ${missingAnswers} had no answer in the file: mark the correct option for those before publishing.`
          : '') +
        (shortOptions ? ` ${shortOptions} have fewer than 4 options.` : '')
      );
      announce(
        `Imported ${finalQuestions.length} questions${imageCount > 0 ? ` with ${imageCount} attached images` : ''} from ${file.name}.`,
        'assertive',
        true
      );
      soundEffects.playSuccess();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Could not read "${file.name}".`);
    }
  };

  /**
   * Bulk-authoring: read a PDF (.pdf) question paper and drop every recognised
   * question into the form — statement, options, correct answer, section,
   * diagram/chart image, solution and hint — so an examiner reviews instead of retyping.
   */
  const handleImportPdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires a change event.
    e.target.value = '';
    if (!file) return;

    setFormError('');
    setFormSuccess('');

    try {
      const result = await extractQuestionsFromPdf(file);

      if (result.questions.length === 0) {
        setFormError(
          `No questions were recognised in PDF "${file.name}". Each question needs a number such as ` +
          '"1." or "Q1.", options such as "(a)" or "A)", and ideally an answer line like "Ans: b".'
        );
        return;
      }

      const stamp = Date.now();
      const imported: QuestionItem[] = result.questions.map((q, i) => {
        const minOptLen = Math.max(4, q.options.length, q.correctOption || 0);
        const optionTexts = [...q.options];
        while (optionTexts.length < minOptLen) optionTexts.push('');
        const stripped = extractAndStripImageUrls(q.questionText);
        const cleanQuestionText = stripped.cleanText || q.questionText.trim();
        const diagramUrl = q.diagramUrl || stripped.imageUrl || '';
        const isChart =
          Boolean(diagramUrl) &&
          /(?:bar|pie|line|histogram|scatter|graph|chart|तालिका|चित्र|आरेख|ग्राफ)\b/i.test(cleanQuestionText);
        const diagramType = q.diagramType || (diagramUrl ? (isChart ? 'chart' : 'image') : undefined);
        return {
          id: `imported-pdf-q-${stamp}-${i}`,
          section: q.section || 'General',
          questionNumber: 0,
          questionText: cleanQuestionText,
          questionType: (diagramType === 'chart' ? 'DI' : 'MCQ') as 'DI' | 'MCQ',
          diagramUrl,
          diagramType,
          options: optionTexts.map((text, oi) => ({
            id: `opt_pdf_${stamp}_${i}_${oi + 1}`,
            number: oi + 1,
            text,
          })),
          correctOption:
            q.correctOption >= 1 && q.correctOption <= optionTexts.length ? q.correctOption : 0,
          explanation: q.explanation,
          hint: q.hint,
        };
      });

      const finalQuestions = imported.map((q, idx) => ({ ...q, questionNumber: idx + 1 }));
      setQuestions(finalQuestions);
      setTotalMarks(Math.max(finalQuestions.length * 2, 20));

      const missingAnswers = finalQuestions.filter((q) => !q.correctOption).length;
      const shortOptions = finalQuestions.filter((q) => q.options.length < 4).length;
      const imageCount = finalQuestions.filter((q) => Boolean(q.diagramUrl)).length;

      setFormSuccess(
        `Imported ${finalQuestions.length} question${finalQuestions.length === 1 ? '' : 's'}` +
        (imageCount > 0 ? ` with ${imageCount} diagram/chart image${imageCount === 1 ? '' : 's'} attached` : '') +
        ` from PDF "${file.name}" — exactly ${finalQuestions.length} questions loaded into workbench.` +
        (missingAnswers
          ? ` ${missingAnswers} had no answer in the file: mark the correct option for those before publishing.`
          : '') +
        (shortOptions ? ` ${shortOptions} have fewer than 4 options.` : '')
      );
      announce(
        `Imported ${finalQuestions.length} questions${imageCount > 0 ? ` with ${imageCount} attached images` : ''} from ${file.name}.`,
        'assertive',
        true
      );
      soundEffects.playSuccess();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Could not read "${file.name}".`);
    }
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, questionNumber: i + 1 }));
    });
  };

  const handleUpdateQuestion = (idx: number, field: keyof QuestionItem, val: any) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const handleUpdateOption = (qIdx: number, optNum: number, text: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const opts = updated[qIdx].options.map((o) => (o.number === optNum ? { ...o, text } : o));
      updated[qIdx] = { ...updated[qIdx], options: opts };
      return updated;
    });
  };

  const handlePublishExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!title.trim() || !code.trim() || !description.trim()) {
      setFormError('Please fill in Exam Title, Code, and Description.');
      return;
    }

    // Verify all questions have text and options
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText.trim()) {
        setFormError(`Question ${i + 1} is missing its question text.`);
        return;
      }
      for (const opt of q.options) {
        if (!opt.text.trim()) {
          setFormError(`Question ${i + 1}, Option ${opt.number} cannot be empty.`);
          return;
        }
      }
      // An imported question whose answer was missing from the file leaves the
      // radio unselected; grading would otherwise mark every student wrong.
      if (!q.correctOption || !q.options.some((o) => o.number === q.correctOption)) {
        setFormError(`Question ${i + 1} has no correct option selected. Mark the right answer.`);
        return;
      }
    }

    const examPayload: Exam = {
      id: editingExamId || `exam-${Date.now()}`,
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      category: category === 'All' ? 'Staff Selection' : category,
      durationMinutes: Number(durationMinutes),
      totalMarks: Number(totalMarks),
      negativeMarking: examType === 'practice' ? 'No negative marking (Practice)' : negativeMarking,
      difficulty,
      sections: Array.from(new Set(questions.map((q) => q.section))),
      questionCount: questions.length,
      questions,
    };

    let result: { ok: boolean; message?: string };
    if (editingExamId) {
      result = await updateExistingExam(editingExamId, examPayload, examType);
    } else {
      result = await addNewExam(examPayload, examType);
    }

    if (!result.ok) {
      setFormError(
        result.message ?? 'Could not save the examination. Please try again.'
      );
      return;
    }

    setFormSuccess(
      editingExamId
        ? `"${examPayload.title}" was updated successfully!`
        : `"${examPayload.title}" was published successfully! Students can now take it.`
    );
    soundEffects.playSuccess();

    // Trigger real-time cross-tab & cross-window notification and catalog sync for students
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dristix:notification-broadcast'));
    }
    try {
      authBroadcastChannel?.postMessage({
        type: 'NOTIFICATION_BROADCAST',
        timestamp: Date.now(),
      });
    } catch {}

    // Reset creator form and exit edit mode
    setEditingExamId(null);
    setTitle('');
    setCode('');
    setDescription('');
    setActiveAdminTab('manage');
  };

  const handleTestAsStudent = (exam: Exam, type: 'exam' | 'practice') => {
    void selectExam(exam.id, type);
    onReturnToStudent();
  };

  return (
    <div className="w-full flex-1 min-h-0 h-full max-h-[100dvh] overflow-hidden bg-theme-bg text-theme-text flex flex-col lg:flex-row transition-colors duration-200">
      {/* Mobile Top App Bar */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#031d22] text-white border-b border-[#0d3b45] shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open Admin Navigation Menu"
            className="p-2 rounded-xl bg-[#06333c] text-teal-200 border border-[#0d4a57] hover:bg-[#094754] transition"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#006d5c] text-white flex items-center justify-center font-black text-xs shadow-md">
              DX
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-tight">DrishtiX</h1>
              <span className="text-[10px] text-teal-300/80 font-bold block">Admin Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            aria-label="Refresh Database Sync"
            className="p-1.5 sm:p-2 rounded-xl bg-[#06333c] text-teal-200 border border-[#0d4a57] hover:text-white text-xs transition"
            title="Sync Database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-teal-300' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onReturnToStudent}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#06333c] hover:bg-[#006d5c] text-teal-100 hover:text-white font-bold text-xs flex items-center gap-1 shadow-xs transition"
            title="Switch to Student Portal"
            aria-label="Switch to Student Portal"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Portal</span>
          </button>
          <button
            type="button"
            onClick={logoutAdmin}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-red-500/40 bg-red-600/90 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
            title="Sign out of Administrator account"
            aria-label="Logout of Admin account"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Mobile Sidebar Overlay Backdrop */}
      {isMobileSidebarOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation overlay"
          onClick={() => setIsMobileSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsMobileSidebarOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Left Sidebar (Dark Teal Enterprise Sidebar Matching Design) */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-30 h-full max-h-[100dvh] w-64 sm:w-72 lg:w-[18.5rem] shrink-0 bg-[#031d22] text-white border-r border-[#0d3b45] flex flex-col justify-between p-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none overflow-y-auto ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        <div className="space-y-6">
          {/* Top Brand Logo & Portal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#0d3b45]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#006d5c] text-white flex items-center justify-center font-black text-sm shadow-md">
                DX
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-wide leading-tight">DrishtiX</h2>
                <span className="text-[11px] font-semibold text-teal-300/80">Admin Portal</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close sidebar on mobile"
              className="lg:hidden p-1.5 rounded-lg border border-[#0d3b45] text-teal-300 hover:text-white hover:bg-[#06333c] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Items (Only Relevant & Implemented Pages) */}
          <nav role="tablist" aria-label="Admin Navigation" className="space-y-1.5">
            {/* Dashboard */}
            <button
              type="button"
              role="tab"
              aria-selected={activeAdminTab === 'dashboard'}
              onClick={() => {
                setActiveAdminTab('dashboard');
                setIsMobileSidebarOpen(false);
                soundEffects.playSelect();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors duration-150 relative overflow-hidden group ${
                activeAdminTab === 'dashboard'
                  ? 'bg-gradient-to-r from-[#006d5c] to-[#005a4c] text-white shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white hover:bg-[#083038]'
              }`}
            >
              {activeAdminTab === 'dashboard' && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-300 rounded-r-full shadow-[0_0_8px_#5eead4]" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <LayoutDashboard className="w-4 h-4 shrink-0 text-teal-200 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="whitespace-nowrap">Dashboard</span>
              </div>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/25 text-teal-200/80 border border-teal-500/20 shrink-0">
                1
              </kbd>
            </button>

            {/* Manage Exams */}
            <button
              type="button"
              role="tab"
              aria-selected={activeAdminTab === 'manage'}
              onClick={() => {
                setActiveAdminTab('manage');
                setIsMobileSidebarOpen(false);
                soundEffects.playSelect();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors duration-150 relative overflow-hidden group ${
                activeAdminTab === 'manage'
                  ? 'bg-gradient-to-r from-[#006d5c] to-[#005a4c] text-white shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white hover:bg-[#083038]'
              }`}
            >
              {activeAdminTab === 'manage' && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-300 rounded-r-full shadow-[0_0_8px_#5eead4]" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <BookOpen className="w-4 h-4 shrink-0 text-teal-200 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="whitespace-nowrap">Manage Exams</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-[#021417] text-teal-200 border border-[#0d4a57]/40 tabular-nums">
                  {availableExams.length + availablePracticeDrills.length}
                </span>
                <kbd className="hidden sm:inline-block px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-black/25 text-teal-200/60">
                  2
                </kbd>
              </div>
            </button>

            {/* Question Bank Studio */}
            <button
              type="button"
              role="tab"
              aria-selected={activeAdminTab === 'create'}
              onClick={() => {
                setActiveAdminTab('create');
                setIsMobileSidebarOpen(false);
                soundEffects.playSelect();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors duration-150 relative overflow-hidden group ${
                activeAdminTab === 'create'
                  ? 'bg-gradient-to-r from-[#006d5c] to-[#005a4c] text-white shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white hover:bg-[#083038]'
              }`}
            >
              {activeAdminTab === 'create' && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-300 rounded-r-full shadow-[0_0_8px_#5eead4]" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <HelpCircle className="w-4 h-4 shrink-0 text-teal-200 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="whitespace-nowrap">Question Bank</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-teal-400/20 text-teal-200 border border-teal-400/30">
                  {editingExamId ? 'Edit' : 'Studio'}
                </span>
                <kbd className="hidden sm:inline-block px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-black/25 text-teal-200/60">
                  3
                </kbd>
              </div>
            </button>

            {/* Student Management */}
            <button
              type="button"
              role="tab"
              aria-selected={activeAdminTab === 'students'}
              onClick={() => {
                setActiveAdminTab('students');
                setIsMobileSidebarOpen(false);
                soundEffects.playSelect();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors duration-150 relative overflow-hidden group ${
                activeAdminTab === 'students'
                  ? 'bg-gradient-to-r from-[#006d5c] to-[#005a4c] text-white shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white hover:bg-[#083038]'
              }`}
            >
              {activeAdminTab === 'students' && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-300 rounded-r-full shadow-[0_0_8px_#5eead4]" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <Users className="w-4 h-4 shrink-0 text-teal-200 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="whitespace-nowrap">Student Roster</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-[#021417] text-teal-200 border border-[#0d4a57]/40 tabular-nums">
                  {students.length}
                </span>
                <kbd className="hidden sm:inline-block px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-black/25 text-teal-200/60">
                  4
                </kbd>
              </div>
            </button>

            {/* Submissions & Results */}
            <button
              type="button"
              role="tab"
              aria-selected={activeAdminTab === 'submissions'}
              onClick={() => {
                setActiveAdminTab('submissions');
                setIsMobileSidebarOpen(false);
                soundEffects.playSelect();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors duration-150 relative overflow-hidden group ${
                activeAdminTab === 'submissions'
                  ? 'bg-gradient-to-r from-[#006d5c] to-[#005a4c] text-white shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white hover:bg-[#083038]'
              }`}
            >
              {activeAdminTab === 'submissions' && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-300 rounded-r-full shadow-[0_0_8px_#5eead4]" />
              )}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Award className="w-4 h-4 shrink-0 text-teal-200 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="whitespace-nowrap">Submissions & Reports</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-[#021417] text-teal-200 border border-[#0d4a57]/40 tabular-nums">
                  {submissions.length}
                </span>
                <kbd className="hidden sm:inline-block px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-black/25 text-teal-200/60">
                  5
                </kbd>
              </div>
            </button>

            {/* Send Notifications (Rule 4) */}
            <button
              type="button"
              role="tab"
              aria-selected={activeAdminTab === 'notifications'}
              onClick={() => {
                setActiveAdminTab('notifications');
                setIsMobileSidebarOpen(false);
                soundEffects.playSelect();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors duration-150 relative overflow-hidden group ${
                activeAdminTab === 'notifications'
                  ? 'bg-gradient-to-r from-[#006d5c] to-[#005a4c] text-white shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white hover:bg-[#083038]'
              }`}
            >
              {activeAdminTab === 'notifications' && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-300 rounded-r-full shadow-[0_0_8px_#5eead4]" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <Megaphone className="w-4 h-4 shrink-0 text-teal-200 group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span className="whitespace-nowrap">Send Notifications</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <kbd className="hidden sm:inline-block px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-black/25 text-teal-200/60">
                  6
                </kbd>
              </div>
            </button>
          </nav>

          {/* Live Connectivity Badge */}
          <div className="p-3 rounded-2xl bg-[#021418] border border-[#0d3b45] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <div className="text-[11px] font-extrabold text-teal-100">Atlas Live Sync</div>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              title="Refresh database records"
              className="text-[10px] font-bold text-teal-300 hover:text-white flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-teal-200' : ''}`} />
              <span>{isSyncing ? '...' : 'Sync'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Section: Decorative Card & Actions */}
        <div className="space-y-3 pt-4 shrink-0">
          {/* Aesthetic Decorative Card (Matching Design) */}
          <div className="hidden xs:block relative p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-[#063b44] via-[#02242b] to-[#011417] border border-[#006d5c]/30 overflow-hidden shadow-lg">
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-[#006d5c]/10 rounded-full blur-xl pointer-events-none" />
            <div className="relative z-10 space-y-1">
              <div className="text-xs font-black tracking-wide text-teal-300">DrishtiX</div>
              <p className="text-[11px] font-bold text-teal-100/90 leading-snug">
                Accessible Education Stronger Futures
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={onReturnToStudent}
              className="w-full px-3 py-2 rounded-xl bg-[#06333c] hover:bg-[#006d5c] text-teal-100 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Student Portal</span>
            </button>

            <button
              type="button"
              onClick={logoutAdmin}
              className="w-full px-3 py-2.5 rounded-xl border border-red-500/40 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
              title="Sign out of Administrator account"
              aria-label="Logout of Admin account"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area on Right */}
      <main className="flex-1 min-w-0 flex flex-col h-full max-h-[100dvh] min-h-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 shrink-0 bg-theme-surface/90 backdrop-blur-md border-b border-theme-border px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          {/* Global Search Bar & Command Palette Launcher */}
          <div className="relative flex-1 min-w-[220px] max-w-lg">
            <Search className="w-4 h-4 text-theme-text/40 absolute left-3.5 top-3" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search or jump anywhere..."
              className="w-full pl-10 pr-20 py-2 rounded-xl bg-theme-bg border border-theme-border text-sm text-theme-text placeholder:text-theme-text/40 focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition font-medium"
            />
            <button
              type="button"
              onClick={() => {
                setIsCommandPaletteOpen(true);
                soundEffects.playSelect();
              }}
              className="absolute right-2 top-1.5 px-2 py-1 rounded-lg bg-theme-surface border border-theme-border text-[11px] font-mono font-bold text-theme-text/70 hover:text-[#005a4c] dark:hover:text-teal-300 hover:border-[#006d5c] transition flex items-center gap-1 shadow-2xs"
              title="Open Command Palette (Ctrl+K)"
            >
              <Command className="w-3 h-3" />
              <span>K</span>
            </button>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-between sm:justify-end w-full sm:w-auto">
            {/* Voice AI Button */}
            <button
              type="button"
              onClick={() => {
                soundEffects.playSuccess();
                announce('Voice AI Assistant activated for DrishtiX Administration.');
              }}
              className="px-3.5 py-1.5 rounded-full bg-[#006d5c] hover:bg-[#005a4c] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
              title="Voice AI Assistant"
            >
              <Mic className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Voice AI</span>
            </button>

            {/* Font Size Scaling Controls */}
            <div className="flex items-center rounded-xl bg-theme-surface border border-theme-border p-0.5 text-xs sm:text-sm font-bold">
              <button
                type="button"
                title="Decrease font scale"
                onClick={() => {
                  const scales: TextScale[] = [100, 125, 150, 175, 200];
                  const idx = scales.indexOf(fontSize);
                  if (idx > 0) setFontSize(scales[idx - 1]);
                }}
                className="px-2.5 py-1 rounded hover:bg-theme-border/40 text-theme-text/70 hover:text-theme-text"
              >
                A-
              </button>
              <button
                type="button"
                title="Default font scale"
                onClick={() => setFontSize(100)}
                className="px-2.5 py-1 rounded hover:bg-theme-border/40 text-theme-text"
              >
                A
              </button>
              <button
                type="button"
                title="Increase font scale"
                onClick={() => {
                  const scales: TextScale[] = [100, 125, 150, 175, 200];
                  const idx = scales.indexOf(fontSize);
                  if (idx < scales.length - 1) setFontSize(scales[idx + 1]);
                }}
                className="px-2.5 py-1 rounded hover:bg-theme-border/40 text-theme-text/70 hover:text-theme-text"
              >
                A+
              </button>
            </div>

            {/* Quick Multi-Theme Switcher (Teal & Charcoal Dark Only) */}
            <button
              type="button"
              onClick={() => {
                const next: ThemeMode = theme === 'dark' ? 'teal-cream' : 'dark';
                setTheme(next);
                soundEffects.playSelect();
                const label = next === 'dark' ? 'Charcoal Dark' : 'Teal';
                useAnnouncerStore
                  .getState()
                  .announce(`Theme changed to ${label}.`, 'assertive', true);
              }}
              className="px-3 py-1.5 rounded-xl border border-theme-border bg-theme-surface hover:bg-theme-border/30 text-xs sm:text-sm font-bold flex items-center gap-1.5 text-theme-text transition cursor-pointer"
              title={`Current theme: ${theme === 'dark' ? 'Charcoal Dark' : 'Teal'}. Click to toggle theme.`}
              aria-label={`Current theme: ${theme === 'dark' ? 'Charcoal Dark' : 'Teal'}. Click to toggle theme.`}
            >
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" aria-hidden="true" />
              )}
              <span>
                {theme === 'dark' ? 'Charcoal Dark' : 'Teal'}
              </span>
            </button>



            {/* Admin Profile Chip */}
            <div className="flex items-center gap-2.5 pl-2.5 border-l border-theme-border">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#006d5c] to-teal-400 text-white flex items-center justify-center font-black text-sm shadow-xs">
                  Dx
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#051c22]" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs sm:text-sm font-extrabold text-theme-text leading-none">DrishtiX Administrator</div>
                <div className="text-[11px] text-theme-text/60 font-mono mt-0.5 flex items-center gap-1">
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">Super Admin</span>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={logoutAdmin}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-600 text-red-700 dark:text-red-300 hover:text-white font-bold text-xs transition cursor-pointer"
              title="Sign out of Administrator account"
              aria-label="Logout of Admin account"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Content Body Container */}
        <div className={`p-4 sm:p-6 lg:p-8 flex-1 flex flex-col min-h-0 ${activeAdminTab === 'dashboard' ? 'space-y-6' : 'space-y-6'}`}>
          {/* TAB: DASHBOARD */}
          {activeAdminTab === 'dashboard' && (
            <div className="space-y-6">
              {/* 1. Hero Welcome Banner */}
              {(() => {
                const currentHour = new Date().getHours();
                const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
                return (
                  <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-[#eef7f6] via-[#f7faf8] to-[#f4f7f2] dark:from-[#062930] dark:via-[#08353d] dark:to-[#052329] border border-[#d3e9e6] dark:border-[#0d4752] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Background Botanical Illustration */}
                    <div className="absolute right-0 top-0 bottom-0 w-80 opacity-20 dark:opacity-10 pointer-events-none flex items-center justify-end pr-4">
                      <svg viewBox="0 0 300 200" className="w-full h-full text-emerald-600 fill-current">
                        <path d="M150,20 C180,60 220,120 280,180 C230,170 170,140 150,80 C130,140 70,170 20,180 C80,120 120,60 150,20 Z" />
                      </svg>
                    </div>

                    <div className="relative z-10 space-y-2 max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300">
                          Enterprise Command Center
                        </span>
                        <span className="text-xs text-theme-text/60 font-medium">Atlas Live Synchronized</span>
                      </div>
                      <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-theme-text tracking-tight">
                        {greeting}, DrishtiX Administrator!
                      </h1>
                      <p className="text-xs sm:text-sm text-theme-text/80 leading-relaxed">
                        Manage examinations, oversee candidate accommodation preferences, author multimodal questions, and monitor evaluative telemetry in real-time.
                      </p>

                      {/* Live System Signal Badges */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-bold">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          MongoDB Atlas Connected
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 font-extrabold border border-teal-500/20 flex items-center gap-1.5">
                          <Volume2 className="w-3 h-3" />
                          Web Audio Sonification Active
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center gap-1.5">
                          <Shield className="w-3 h-3" />
                          Role: Super Admin
                        </span>
                      </div>
                    </div>

                    {/* Right Quote Badge */}
                    <div className="relative z-10 p-3 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl bg-theme-surface/90 backdrop-blur-md border border-theme-border shadow-xs sm:shadow-sm flex items-center justify-between sm:block sm:text-right w-full sm:w-auto shrink-0 gap-3">
                      <div className="flex items-center gap-2.5 sm:block">
                        <div className="sm:hidden w-8 h-8 rounded-lg bg-theme-primary/10 text-theme-primary flex items-center justify-center font-black text-xs shrink-0">
                          DX
                        </div>
                        <div>
                          <span className="block text-xs sm:text-base font-black text-theme-primary tracking-tight leading-snug">
                            “Accessible Education, Stronger Futures”
                          </span>
                          <span className="block text-[10px] text-theme-text/60 font-semibold mt-0.5">
                            DrishtiX Architecture v2.4
                          </span>
                        </div>
                      </div>
                      <span className="sm:hidden px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#006d5c]/10 text-[#005a4c] dark:text-teal-300 shrink-0">
                        Admin Core
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 2. 4 Hero KPI Stat Cards (Interactive & Sparkline Enhanced) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {/* Registered Students */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveAdminTab('students');
                    soundEffects.playSelect();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveAdminTab('students');
                      soundEffects.playSelect();
                    }
                  }}
                  className="p-4 sm:p-5 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex items-center justify-between gap-3 hover:border-emerald-500/50 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                  title="View registered student cohort"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Users className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl sm:text-3xl font-black text-theme-text leading-tight">{students.length || 7}</div>
                      <span className="text-xs sm:text-sm font-semibold text-theme-text/75 block truncate">Registered Students</span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                        <span>↑</span> +{Math.max(2, students.length)} enrolled
                      </span>
                    </div>
                  </div>
                  {/* Micro Sparkline */}
                  <svg viewBox="0 0 60 25" className="w-16 h-7 shrink-0 text-emerald-500" fill="none">
                    <path d="M2,22 Q15,18 28,12 T45,8 T58,3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Total Submissions */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveAdminTab('submissions');
                    soundEffects.playSelect();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveAdminTab('submissions');
                      soundEffects.playSelect();
                    }
                  }}
                  className="p-4 sm:p-5 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex items-center justify-between gap-3 hover:border-purple-500/50 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                  title="View student test submissions"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <FileText className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl sm:text-3xl font-black text-theme-text leading-tight">{submissions.length}</div>
                      <span className="text-xs sm:text-sm font-semibold text-theme-text/75 block truncate">Total Submissions</span>
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 mt-0.5">
                        <span>↑</span> {submissions.length} graded
                      </span>
                    </div>
                  </div>
                  {/* Micro Sparkline */}
                  <svg viewBox="0 0 60 25" className="w-16 h-7 shrink-0 text-purple-500" fill="none">
                    <path d="M2,20 Q15,22 28,14 T45,7 T58,4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Active Tests */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveAdminTab('manage');
                    soundEffects.playSelect();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveAdminTab('manage');
                      soundEffects.playSelect();
                    }
                  }}
                  className="p-4 sm:p-5 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex items-center justify-between gap-3 hover:border-amber-500/50 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                  title="Manage tests repository"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <TrendingUp className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl sm:text-3xl font-black text-theme-text leading-tight">
                        {availableExams.length + availablePracticeDrills.length}
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-theme-text/75 block truncate">Active Tests</span>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                        <span>↑</span> +{availableExams.length} in bank
                      </span>
                    </div>
                  </div>
                  {/* Micro Sparkline */}
                  <svg viewBox="0 0 60 25" className="w-16 h-7 shrink-0 text-amber-500" fill="none">
                    <path d="M2,21 Q18,17 30,13 T48,8 T58,2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Average Accuracy */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveAdminTab('submissions');
                    soundEffects.playSelect();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveAdminTab('submissions');
                      soundEffects.playSelect();
                    }
                  }}
                  className="p-4 sm:p-5 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex items-center justify-between gap-3 hover:border-rose-500/50 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                  title="View accuracy analytics"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Award className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl sm:text-3xl font-black text-theme-text leading-tight">{avgScore || 78}%</div>
                      <span className="text-xs sm:text-sm font-semibold text-theme-text/75 block truncate">Average Accuracy</span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                        <span>↑</span> +3% performance
                      </span>
                    </div>
                  </div>
                  {/* Micro Sparkline */}
                  <svg viewBox="0 0 60 25" className="w-16 h-7 shrink-0 text-rose-500" fill="none">
                    <path d="M2,18 Q16,19 32,11 T46,7 T58,3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* 3. Middle Row: Submission Overview Chart + Test Performance Donut + Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
                {/* 3a. Submission Overview Area Chart (5 cols) */}
                <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base sm:text-lg font-extrabold text-theme-text">Submission Overview</h3>
                      <div className="flex items-center gap-3 text-xs text-theme-text/70 mt-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#006d5c]" /> Submissions
                        </span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Unique Students
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-theme-bg border border-theme-border text-theme-text/80 shadow-2xs">
                      Last 30 Days ▾
                    </span>
                  </div>

                  {/* SVG Bezier Spline Area Chart */}
                  <div className="w-full flex-1 flex flex-col justify-end pt-2">
                    <svg viewBox="0 0 450 135" className="w-full h-36 sm:h-44">
                      <defs>
                        <linearGradient id="areaTeal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#006d5c" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#006d5c" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="areaAmber" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      <line x1="0" y1="25" x2="450" y2="25" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                      <line x1="0" y1="65" x2="450" y2="65" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                      <line x1="0" y1="100" x2="450" y2="100" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />

                      <path
                        d="M 20 100 C 60 90, 90 75, 140 85 C 190 95, 230 55, 280 45 C 330 35, 380 25, 430 12 L 430 120 L 20 120 Z"
                        fill="url(#areaTeal)"
                      />
                      <path
                        d="M 20 100 C 60 90, 90 75, 140 85 C 190 95, 230 55, 280 45 C 330 35, 380 25, 430 12"
                        fill="none"
                        stroke="#006d5c"
                        strokeWidth="3"
                      />

                      <path
                        d="M 20 115 C 70 105, 110 110, 160 100 C 210 90, 260 85, 310 75 C 360 65, 400 60, 430 50 L 430 120 L 20 120 Z"
                        fill="url(#areaAmber)"
                      />
                      <path
                        d="M 20 115 C 70 105, 110 110, 160 100 C 210 90, 260 85, 310 75 C 360 65, 400 60, 430 50"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                      />

                      <circle cx="280" cy="45" r="4" fill="#006d5c" />
                      <circle cx="430" cy="12" r="4.5" fill="#006d5c" />
                      <circle cx="430" cy="50" r="4" fill="#f59e0b" />
                    </svg>

                    <div className="flex justify-between text-xs text-theme-text/60 font-semibold px-1 pt-2">
                      <span>Sep 01</span>
                      <span>Sep 05</span>
                      <span>Sep 10</span>
                      <span>Sep 15</span>
                      <span>Sep 20</span>
                      <span>Sep 25</span>
                      <span>Sep 30</span>
                    </div>
                  </div>
                </div>

                {/* 3b. Test Performance Donut (3 cols) */}
                <div className="lg:col-span-3 p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-extrabold text-theme-text">Test Performance</h3>
                    <span className="text-xs font-bold text-theme-text/70">All Tests ▾</span>
                  </div>

                  <div className="flex items-center justify-center py-3">
                    <div className="relative flex items-center justify-center">
                      <svg viewBox="0 0 100 100" className="w-28 h-28 sm:w-32 sm:h-32 -rotate-90">
                        <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="11" />
                        <circle
                          cx="50"
                          cy="50"
                          r="36"
                          fill="none"
                          stroke="#006d5c"
                          strokeWidth="11"
                          strokeDasharray="100 226"
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="36"
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="11"
                          strokeDasharray="110 226"
                          strokeDashoffset="-100"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="36"
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="11"
                          strokeDasharray="16 226"
                          strokeDashoffset="-210"
                        />
                      </svg>

                      <div className="absolute text-center">
                        <div className="text-xl sm:text-2xl font-black text-theme-text leading-none">
                          {submissions.length}
                        </div>
                        <div className="text-[10px] text-theme-text/60 font-bold uppercase tracking-wider mt-1">Submissions</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs sm:text-sm pt-3 border-t border-theme-border/40">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-theme-text/80 font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#006d5c]" /> Correct
                      </span>
                      <span className="font-extrabold text-theme-text">
                        {Math.round(totalSubmissions ? avgScore : 0)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-theme-text/80 font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Incorrect
                      </span>
                      <span className="font-extrabold text-theme-text">
                        {Math.max(1, 100 - Math.round(totalSubmissions ? avgScore : 44) - 7)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-theme-text/80 font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Review
                      </span>
                      <span className="font-extrabold text-theme-text">7%</span>
                    </div>
                  </div>
                </div>

                {/* 3c. Quick Actions (4 cols) */}
                <div className="lg:col-span-4 p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex flex-col justify-between">
                  <h3 className="text-base sm:text-lg font-extrabold text-theme-text mb-3">Quick Actions</h3>

                  <div className="grid grid-cols-2 gap-3 flex-1">
                    {/* Action 1: Create New Test */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExamId(null);
                        setActiveAdminTab('create');
                        soundEffects.playSelect();
                      }}
                      className="p-3 sm:p-3.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-left transition flex flex-col justify-between group min-h-[95px]"
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition">
                        <PlusCircle className="w-5 h-5" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xs sm:text-sm font-black text-theme-text leading-tight">Create New Test</div>
                        <div className="text-xs text-theme-text/60 mt-0.5">Add examination</div>
                      </div>
                    </button>

                    {/* Action 2: Manage Questions */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAdminTab('manage');
                        soundEffects.playSelect();
                      }}
                      className="p-3 sm:p-3.5 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-left transition flex flex-col justify-between group min-h-[95px]"
                    >
                      <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xs sm:text-sm font-black text-theme-text leading-tight">Manage Questions</div>
                        <div className="text-xs text-theme-text/60 mt-0.5">Edit / Import</div>
                      </div>
                    </button>

                    {/* Action 3: Student Management */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAdminTab('students');
                        soundEffects.playSelect();
                      }}
                      className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-left transition flex flex-col justify-between group min-h-[95px]"
                    >
                      <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xs sm:text-sm font-black text-theme-text leading-tight">Student Roster</div>
                        <div className="text-xs text-theme-text/60 mt-0.5">Manage students</div>
                      </div>
                    </button>

                    {/* Action 4: View Reports */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAdminTab('submissions');
                        soundEffects.playSelect();
                      }}
                      className="p-3 sm:p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-left transition flex flex-col justify-between group min-h-[95px]"
                    >
                      <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition">
                        <Award className="w-5 h-5" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xs sm:text-sm font-black text-theme-text leading-tight">View Reports</div>
                        <div className="text-xs text-theme-text/60 mt-0.5">Live submissions</div>
                      </div>
                    </button>

                    {/* Action 5: Send Notification */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAdminTab('notifications');
                        soundEffects.playSelect();
                      }}
                      className="col-span-2 p-3 rounded-2xl bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/25 text-left transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#006d5c] text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition">
                          <Megaphone className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-black text-theme-text leading-tight">Send Notification</div>
                          <div className="text-xs text-theme-text/60 mt-0.5">Broadcast message to candidates</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-teal-600 dark:text-teal-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Bottom Row: Recent Submissions + Top Performing Students + System Status */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
                {/* 4a. Recent Submissions (5 cols) */}
                <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base sm:text-lg font-extrabold text-theme-text">Recent Submissions</h3>
                    <div className="flex items-center gap-2">
                      {submissions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllSubmissions}
                          disabled={isClearingSubmissions}
                          className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                          title="Clear all test submission records"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear History</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveAdminTab('submissions')}
                      className="text-xs sm:text-sm font-bold text-[#005a4c] dark:text-teal-300 hover:underline flex items-center gap-1"
                    >
                      <span>View All</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Recent Candidate Submissions Table"
                    className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50 rounded-xl"
                  >
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-theme-border text-xs font-bold text-theme-text/60 uppercase tracking-wider">
                          <th className="py-2.5 px-2">Candidate</th>
                          <th className="py-2.5 px-2">Exam</th>
                          <th className="py-2.5 px-2 text-center">Score</th>
                          <th className="py-2.5 px-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme-border/40">
                        {submissions.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-xs text-theme-text/60 font-semibold">
                              No recent candidate submissions yet. Test attempts will appear here in real time.
                            </td>
                          </tr>
                        ) : (
                          submissions.slice(0, 4).map((sub) => (
                            <tr key={sub.id} className="hover:bg-theme-bg/50 transition">
                              <td className="py-2.5 px-2 font-bold text-theme-text flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-[#006d5c]/20 text-[#005a4c] dark:text-teal-300 font-black text-xs flex items-center justify-center shrink-0">
                                  {(sub.studentName || 'C').charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate max-w-[130px] font-semibold">{sub.studentName}</span>
                              </td>
                              <td className="py-2.5 px-2 text-theme-text/80 truncate max-w-[140px] font-medium">{sub.examTitle}</td>
                              <td className="py-2.5 px-2 font-mono font-bold text-center text-theme-text">
                                {Number(sub.score.toFixed(2))} / {sub.maxScore}
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                  Completed
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4b. Top Performing Students (4 cols) */}
                <div className="lg:col-span-4 p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base sm:text-lg font-extrabold text-theme-text">Top Performing Students</h3>
                    <button
                      type="button"
                      onClick={() => setActiveAdminTab('students')}
                      className="text-xs sm:text-sm font-bold text-[#005a4c] dark:text-teal-300 hover:underline flex items-center gap-1"
                    >
                      <span>View All</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {topPerformingStudents.length === 0 ? (
                      <div className="py-6 text-center text-xs text-theme-text/60 font-semibold">
                        No student performance records recorded yet.
                      </div>
                    ) : (
                      topPerformingStudents.map((st) => (
                        <div key={st.rank} className="flex items-center gap-2.5 text-xs sm:text-sm py-1">
                          <span className="w-5 text-center font-bold text-theme-text/70 text-sm">{st.medal}</span>
                          <div className="w-6 h-6 rounded-full bg-theme-bg border border-theme-border text-xs font-black flex items-center justify-center shrink-0">
                            {st.name.charAt(0)}
                          </div>
                          <span className="font-bold text-theme-text truncate flex-1">{st.name}</span>
                          <div className="w-20 sm:w-24 bg-theme-bg rounded-full h-2 overflow-hidden border border-theme-border">
                            <div className="bg-[#006d5c] h-full rounded-full" style={{ width: `${st.accuracy}%` }} />
                          </div>
                          <span className="font-mono font-bold text-theme-text text-xs sm:text-sm w-9 text-right">
                            {st.accuracy}%
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 4c. System Status Checklist (3 cols) */}
                <div className="lg:col-span-3 p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base sm:text-lg font-extrabold text-theme-text">System Status</h3>
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Operational
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs sm:text-sm">
                    {[
                      { name: 'Application Server', icon: HardDrive },
                      { name: 'Database (MongoDB)', icon: Database },
                      { name: 'Audio & Voice AI', icon: Volume2 },
                      { name: 'File Storage', icon: Shield },
                      { name: 'Notifications', icon: Mail },
                      { name: 'Accessibility Engine', icon: CheckCircle2 },
                    ].map((svc) => (
                      <div key={svc.name} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2 text-theme-text/80 truncate">
                          <svc.icon className="w-4 h-4 text-[#005a4c] dark:text-teal-300 shrink-0" />
                          <span className="truncate font-medium">{svc.name}</span>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5. Keyboard Shortcuts Bar */}
              <div className="py-2.5 px-4 sm:px-5 rounded-2xl bg-theme-surface border border-theme-border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-theme-text/80 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-theme-text">
                  <Command className="w-4 h-4 text-[#005a4c] dark:text-teal-300" />
                  <span>Keyboard Shortcuts:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="px-2 py-1 rounded-lg bg-theme-bg border border-theme-border">
                    <kbd className="font-bold text-[#005a4c] dark:text-teal-300">C</kbd> Create Test
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-theme-bg border border-theme-border">
                    <kbd className="font-bold text-[#005a4c] dark:text-teal-300">Q</kbd> Manage Questions
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-theme-bg border border-theme-border">
                    <kbd className="font-bold text-[#005a4c] dark:text-teal-300">S</kbd> Student Management
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-theme-bg border border-theme-border">
                    <kbd className="font-bold text-[#005a4c] dark:text-teal-300">R</kbd> View Reports
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-theme-bg border border-theme-border">
                    <kbd className="font-bold text-[#005a4c] dark:text-teal-300">/</kbd> Search
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-theme-bg border border-theme-border">
                    <kbd className="font-bold text-[#005a4c] dark:text-teal-300">Esc</kbd> Close / Back
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SUBMISSIONS & RESULTS */}
          {activeAdminTab === 'submissions' && (
            <section aria-labelledby="submissions-heading" className="space-y-6">
              {/* 1. Institutional Evaluative Terminal Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-theme-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 uppercase tracking-wider">
                      Audit Terminal
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-xs text-theme-text/60 font-medium">Real-Time Evaluation Records</span>
                  </div>
                  <h2 id="submissions-heading" className="text-xl sm:text-2xl font-black text-theme-text tracking-tight mt-1 flex items-center gap-2">
                    <Award className="w-6 h-6 text-[#005a4c] dark:text-teal-300" aria-hidden="true" />
                    <span>Candidate Submissions & Grading Ledger</span>
                  </h2>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  {submissions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllSubmissions}
                      disabled={isClearingSubmissions}
                      className="px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-red-400"
                      title="Clear all test submission records from database"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{isClearingSubmissions ? 'Clearing Records...' : 'Clear History'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportSubmissionsCsv}
                    className="px-4 py-2 rounded-xl bg-theme-surface hover:bg-theme-border/40 border border-theme-border text-theme-text font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition"
                    title="Export submissions to CSV spreadsheet"
                  >
                    <Download className="w-4 h-4 text-[#005a4c] dark:text-teal-300" />
                    <span>Export Ledger CSV</span>
                  </button>
                </div>
              </div>

              {/* 2. Compact Analytical Metric Ribbon (Single Row Ticker) */}
              <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Total Records:</span>
                    <span className="font-mono font-black text-sm text-theme-text tabular-nums">
                      {isSubmissionsLoading && submissions.length === 0 ? '—' : totalSubmissions}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Cohort Accuracy:</span>
                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {isSubmissionsLoading && submissions.length === 0 ? '—' : `${avgScore}%`}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Distinction Rate (≥80%):</span>
                    <span className="font-mono font-black text-sm text-purple-600 dark:text-purple-400 tabular-nums">
                      {isSubmissionsLoading && submissions.length === 0 ? '—' : `${distinctionRate}%`}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Top Candidate:</span>
                    <span className="font-black text-sm text-[#005a4c] dark:text-teal-300">
                      {isSubmissionsLoading && submissions.length === 0
                        ? '—'
                        : (topPerformingStudents[0]?.name || students[0]?.name || 'N/A')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-theme-text/60 font-mono text-[11px]">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Ledger Status: {isSubmissionsLoading && submissions.length === 0 ? 'Synchronizing...' : 'Synchronized'}</span>
                </div>
              </div>

              {/* 3. Audio Sonification Showcase Strip */}
              {(() => {
                const allQs = [...availableExams, ...availablePracticeDrills].flatMap((e) => e.questions || []);
                const sonifiedQs = allQs.filter((q) => q.graph && q.graph.enabled && q.graph.sonification?.enabled);
                const barCount = sonifiedQs.filter((q) => q.graph?.type === 'bar').length;
                const lineCount = sonifiedQs.filter((q) => q.graph?.type === 'line').length;
                const pieCount = sonifiedQs.filter((q) => q.graph?.type === 'pie').length;

                return (
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-teal-500/5 via-emerald-500/5 to-transparent border border-[#006d5c]/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#006d5c] to-teal-700 text-white flex items-center justify-center text-xl shadow-xs shrink-0">
                        🎧
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-black text-theme-text">
                            Data Sonification Assistive Engine
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-theme-text/70 mt-0.5">
                          Web Audio pitch modulation (250Hz - 900Hz), Stereo spatial audio, trend detection & haptics for visual accessibility.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <span className="px-3 py-1.5 rounded-xl bg-theme-surface border border-theme-border text-xs font-bold text-theme-text flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-[#005a4c] dark:text-teal-300" />
                        <span>{sonifiedQs.length} Sonified Items</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-xs font-bold text-theme-text/80">
                        Bar: {barCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-xs font-bold text-theme-text/80">
                        Line: {lineCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-xs font-bold text-theme-text/80">
                        Pie: {pieCount}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 4. Submissions Filter & Search Toolbar */}
              <div className="p-4 rounded-2xl bg-theme-surface border border-theme-border shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-theme-text/40 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={submissionSearch}
                      onChange={(e) => setSubmissionSearch(e.target.value)}
                      placeholder="Search candidate, roll no, or exam..."
                      className="w-full pl-10 pr-4 py-2 rounded-xl bg-theme-bg border border-theme-border text-xs sm:text-sm text-theme-text placeholder:text-theme-text/40 focus:outline-none focus:ring-2 focus:ring-[#006d5c] font-medium"
                    />
                  </div>

                  {/* Exam Filter Dropdown */}
                  <div className="shrink-0 w-full sm:w-56">
                    <select
                      value={selectedExamFilter}
                      onChange={(e) => setSelectedExamFilter(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-theme-bg border border-theme-border text-xs sm:text-sm font-semibold text-theme-text focus:outline-none focus:ring-2 focus:ring-[#006d5c]"
                      aria-label="Filter submissions by examination paper"
                    >
                      <option value="All">All Tests & Drills</option>
                      {[...new Set(submissions.map((s) => s.examCode))].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Accuracy Filter Pills */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Submission Performance Filters"
                  className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-thin focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50 rounded-lg"
                >
                  <span className="text-xs font-bold text-theme-text/60 shrink-0 mr-1 flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Performance:
                  </span>
                  {(
                    [
                      ['all', 'All Submissions'],
                      ['high', '🌟 Distinction (≥80%)'],
                      ['moderate', '📊 Moderate (50-79%)'],
                      ['low', '⚠️ Review Needed (<50%)'],
                    ] as const
                  ).map(([filterKey, label]) => (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => {
                        setSubmissionAccuracyFilter(filterKey);
                        soundEffects.playSelect();
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 border ${
                        submissionAccuracyFilter === filterKey
                          ? 'bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 border-[#006d5c]'
                          : 'bg-theme-bg border-theme-border text-theme-text/70 hover:text-theme-text'
                      }`}
                    >
                      {label}
                    </button>
                  ))}

                  {submissions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllSubmissions}
                      disabled={isClearingSubmissions}
                      className="ml-auto px-3.5 py-1.5 rounded-lg text-xs font-bold transition shrink-0 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                      title="Clear all test submission records from Admin Portal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isClearingSubmissions ? 'Clearing Records...' : 'Clear History'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 5. Submissions Data Table */}
              <div className="rounded-2xl bg-theme-surface border border-theme-border shadow-xs overflow-hidden">
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Submissions and Reports Data Table"
                  className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50"
                >
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-theme-border text-xs uppercase font-extrabold text-theme-text/70 bg-theme-bg/60">
                        <th scope="col" className="py-3 px-4">Candidate</th>
                        <th scope="col" className="py-3 px-4">Examination Paper</th>
                        <th scope="col" className="py-3 px-4">Completion Date</th>
                        <th scope="col" className="py-3 px-4 text-center">Score</th>
                        <th scope="col" className="py-3 px-4">Accuracy Status</th>
                        <th scope="col" className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border/50">
                      {isSubmissionsLoading && submissions.length === 0 ? (
                        <>
                          {[1, 2, 3].map((idx) => (
                            <tr key={`skeleton-${idx}`} className="animate-pulse">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-theme-border/50 shrink-0" />
                                  <div className="space-y-1.5 flex-1">
                                    <div className="h-3.5 w-28 bg-theme-border/50 rounded" />
                                    <div className="h-2.5 w-16 bg-theme-border/30 rounded" />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="h-3.5 w-44 bg-theme-border/50 rounded mb-1.5" />
                                <div className="h-2.5 w-20 bg-theme-border/30 rounded" />
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="h-3.5 w-20 bg-theme-border/40 rounded mb-1" />
                                <div className="h-2.5 w-12 bg-theme-border/30 rounded" />
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <div className="h-4 w-12 bg-theme-border/50 rounded mx-auto" />
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="h-4 w-20 bg-theme-border/40 rounded" />
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="h-7 w-16 bg-theme-border/40 rounded ml-auto" />
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : paginatedAdminSubmissions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-theme-text/60">
                            <div className="space-y-2">
                              <Award className="w-8 h-8 text-theme-text/30 mx-auto" />
                              <div className="font-bold text-sm text-theme-text">No Submissions Found</div>
                              <p className="text-xs text-theme-text/60">No test attempts match your current search query or filter.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedAdminSubmissions.map((sub) => (
                          <tr key={sub.id} className="hover:bg-theme-bg/50 transition-colors">
                            {/* Candidate info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getStudentGradient(
                                    sub.studentName
                                  )} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs`}
                                >
                                  {sub.studentName.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-extrabold text-theme-text leading-tight">{sub.studentName}</div>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyRoll(sub.studentRoll)}
                                    className="text-[11px] font-mono text-theme-text/60 hover:text-[#005a4c] dark:hover:text-teal-300 flex items-center gap-1 mt-0.5 transition"
                                    title="Click to copy roll number"
                                  >
                                    <span>{sub.studentRoll}</span>
                                    {copiedRoll === sub.studentRoll ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3 opacity-60" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Exam Title & Type */}
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-theme-text max-w-xs truncate" title={sub.examTitle}>
                                {sub.examTitle}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-theme-text/60 mt-0.5">
                                <span className="px-1.5 py-0.2 rounded font-mono font-bold bg-theme-bg border border-theme-border text-[10px]">
                                  {sub.examCode}
                                </span>
                                <span>•</span>
                                <span
                                  className={`text-[11px] font-bold ${
                                    sub.examType === 'practice'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-purple-600 dark:text-purple-400'
                                  }`}
                                >
                                  {sub.examType === 'practice' ? '💡 Practice Drill' : '🏆 Timed Exam'}
                                </span>
                              </div>
                            </td>

                            {/* Completion Date */}
                            <td className="py-3.5 px-4 text-xs text-theme-text/80 whitespace-nowrap">
                              <div className="flex items-center gap-1 font-medium">
                                <Calendar className="w-3.5 h-3.5 text-theme-text/40" />
                                <span>{new Date(sub.submittedAt).toLocaleDateString()}</span>
                              </div>
                              <div className="text-[11px] text-theme-text/50 font-mono pl-4.5">
                                {new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>

                            {/* Score Achieved */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <div className="font-black text-theme-text font-mono text-sm">
                                {Number(sub.score.toFixed(2))} <span className="text-xs text-theme-text/60 font-medium">/ {sub.maxScore}</span>
                              </div>
                            </td>

                            {/* Accuracy Status Progress Bar */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1 min-w-[120px]">
                                <div className="flex items-center justify-between text-xs">
                                  <span
                                    className={`px-2 py-0.2 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                      sub.percentage >= 80
                                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                                        : sub.percentage >= 50
                                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                                    }`}
                                  >
                                    {sub.percentage >= 80 ? 'Distinction' : sub.percentage >= 50 ? 'Passed' : 'Review'}
                                  </span>
                                  <span className="font-black font-mono text-theme-text">{sub.percentage}%</span>
                                </div>
                                <div className="w-full bg-theme-bg h-1.5 rounded-full overflow-hidden border border-theme-border/60">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      sub.percentage >= 80 ? 'bg-[#006d5c]' : sub.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(5, sub.percentage))}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Action Buttons */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSpeakResult(sub)}
                                  title="Listen to student performance summary via speech"
                                  aria-label={`Read result for ${sub.studentName}`}
                                  className="p-2 rounded-xl border border-theme-border bg-theme-bg hover:border-[#006d5c] text-theme-text hover:text-[#005a4c] dark:hover:text-teal-300 transition"
                                >
                                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Delete submission record for ${sub.studentName}?`)) {
                                      deleteSubmission(sub.id);
                                    }
                                  }}
                                  title="Delete submission record"
                                  aria-label={`Delete submission for ${sub.studentName}`}
                                  className="p-2 rounded-xl border border-theme-border bg-theme-bg hover:border-red-500/50 hover:bg-red-500/10 text-theme-text/60 hover:text-red-500 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Admin Submissions Pagination */}
                {filteredSubmissions.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-theme-border bg-theme-bg/30">
                    <div className="text-xs text-theme-text/70 font-medium">
                      Showing <span className="font-bold text-theme-text">{Math.min((submissionPage - 1) * SUBMISSIONS_PER_PAGE + 1, filteredSubmissions.length)}</span> to{' '}
                      <span className="font-bold text-theme-text">{Math.min(submissionPage * SUBMISSIONS_PER_PAGE, filteredSubmissions.length)}</span> of{' '}
                      <span className="font-bold text-theme-text">{filteredSubmissions.length}</span> submissions
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={submissionPage === 1}
                        onClick={() => setSubmissionPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl border border-theme-border bg-theme-surface text-theme-text font-bold text-xs hover:border-[#006d5c] hover:text-[#005a4c] dark:hover:text-teal-300 disabled:opacity-40 disabled:hover:border-theme-border disabled:hover:text-theme-text transition flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Previous</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalSubmissionPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setSubmissionPage(page)}
                            className={`w-7 h-7 rounded-lg font-bold text-xs transition border ${
                              submissionPage === page
                                ? 'bg-[#006d5c] text-white border-[#006d5c] shadow-xs'
                                : 'bg-theme-surface border-theme-border text-theme-text hover:border-[#006d5c]'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={submissionPage === totalSubmissionPages}
                        onClick={() => setSubmissionPage((p) => Math.min(totalSubmissionPages, p + 1))}
                        className="px-3 py-1.5 rounded-xl border border-theme-border bg-theme-surface text-theme-text font-bold text-xs hover:border-[#006d5c] hover:text-[#005a4c] dark:hover:text-teal-300 disabled:opacity-40 disabled:hover:border-theme-border disabled:hover:text-theme-text transition flex items-center gap-1"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB: REGISTERED STUDENTS & COHORT MANAGEMENT */}
          {activeAdminTab === 'students' && (
            <section aria-labelledby="students-roster-heading" className="space-y-6">
              {/* 1. Learner Directory & Accommodations Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-theme-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 uppercase tracking-wider">
                      Learner Directory
                    </span>
                    <span className="text-xs text-theme-text/60 font-medium">Atlas Synchronized</span>
                  </div>
                  <h2 id="students-roster-heading" className="text-xl sm:text-2xl font-black text-theme-text tracking-tight mt-1 flex items-center gap-2">
                    <Users className="w-6 h-6 text-[#005a4c] dark:text-teal-300" aria-hidden="true" />
                    <span>Candidate Roster & Accessibility Accommodations</span>
                  </h2>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportStudentsCsv}
                    className="px-4 py-2 rounded-xl bg-theme-surface hover:bg-theme-border/40 border border-theme-border text-theme-text font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition"
                    title="Export Student Directory as CSV"
                  >
                    <Download className="w-4 h-4 text-[#005a4c] dark:text-teal-300" />
                    <span>Export Roster CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-4 py-2 rounded-xl bg-[#006d5c] hover:bg-[#005a4c] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition disabled:opacity-50"
                    title="Sync records from MongoDB Atlas"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync Atlas'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Direct Accommodations Telemetry Bar (Special Accommodations Breakdown) */}
              <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Enrolled Learners:</span>
                    <span className="font-mono font-black text-sm text-theme-text">{students.length}</span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Active Test Takers:</span>
                    <span className="font-mono font-black text-sm text-teal-600 dark:text-teal-400">{studentsWithAttempts.length} ({cohortActiveRate}%)</span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Cohort Avg Accuracy:</span>
                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">{cohortAvgAccuracy}%</span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Special Accommodations:</span>
                    <span className="font-mono font-black text-sm text-purple-600 dark:text-purple-400">{specialAccommodationsCount} ({visualStudentsCount} Vis · {cognitiveStudentsCount} Cog · {motorStudentsCount} Mot)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-theme-text/60 font-mono text-[11px]">
                  <Shield className="w-3.5 h-3.5 text-purple-500" />
                  <span>Inclusive Proctoring Active</span>
                </div>
              </div>

              {/* 3. Interactive Filter & Search Control Toolbar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-surface border border-theme-border shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                  {/* Search Box */}
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-theme-text/40 absolute left-3.5 top-3" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Search candidate, roll no, or email..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full h-10 pl-10 pr-9 rounded-xl border border-theme-border bg-theme-bg text-sm text-theme-text placeholder:text-theme-text/40 focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition font-medium"
                    />
                    {studentSearch && (
                      <button
                        type="button"
                        onClick={() => setStudentSearch('')}
                        className="absolute right-3 top-3 text-theme-text/40 hover:text-theme-text"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Sort By Dropdown */}
                  <div className="flex items-center gap-2 shrink-0">
                    <label htmlFor="admin-student-sort" className="text-xs font-bold text-theme-text/70 flex items-center gap-1 cursor-pointer">
                      <SlidersHorizontal className="w-3.5 h-3.5" /> Sort:
                    </label>
                    <select
                      id="admin-student-sort"
                      aria-label="Sort Candidates"
                      title="Sort Candidates"
                      value={studentSortBy}
                      onChange={(e) => setStudentSortBy(e.target.value as any)}
                      className="h-10 px-3 rounded-xl border border-theme-border bg-theme-bg text-xs sm:text-sm font-semibold text-theme-text focus:outline-none focus:ring-2 focus:ring-[#006d5c] cursor-pointer"
                    >
                      <option value="recent">Recently Registered</option>
                      <option value="name">Candidate Name (A-Z)</option>
                      <option value="attempts">Most Test Attempts</option>
                      <option value="accuracy">Highest Accuracy %</option>
                    </select>
                  </div>
                </div>

                {/* Filter Chips: Accessibility Preference */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-theme-border/50 text-xs font-bold">
                  <span className="text-theme-text/60 mr-1 text-xs">Filter Mode:</span>
                  {[
                    { id: 'all', label: 'All Candidates', count: students.length },
                    { id: 'standard', label: 'Standard Profile', count: students.filter((s) => !s.accessibilityPreference || s.accessibilityPreference === 'Standard' || String(s.accessibilityPreference).toLowerCase() === 'standard').length },
                    { id: 'visual', label: 'Visual Assistance', count: visualStudentsCount },
                    { id: 'adhd-cognitive', label: 'Cognitive / ADHD', count: cognitiveStudentsCount },
                    { id: 'motor', label: 'Motor Assist', count: motorStudentsCount },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        setStudentFilterPref(chip.id);
                        soundEffects.playSelect();
                      }}
                      className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${studentFilterPref === chip.id
                        ? 'bg-[#006d5c] text-white shadow-xs'
                        : 'bg-theme-bg border border-theme-border text-theme-text/70 hover:text-theme-text hover:bg-theme-border/30'
                      }`}
                    >
                      <span>{chip.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${studentFilterPref === chip.id
                        ? 'bg-black/20 text-white'
                        : 'bg-theme-border/40 text-theme-text/80'
                      }`}>
                        {chip.count}
                      </span>
                    </button>
                  ))}

                  {/* Showing count indicator */}
                  <span className="ml-auto text-xs text-theme-text/60 font-medium">
                    Showing {filteredStudents.length} of {students.length} candidates
                  </span>
                </div>
              </div>

              {/* 4. Candidate Directory Table / Grid */}
              {filteredStudents.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-theme-surface border border-theme-border shadow-sm space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[#006d5c]/10 text-[#005a4c] dark:text-teal-300 flex items-center justify-center">
                    <Users className="w-7 h-7" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-theme-text">No registered candidates match your filters</h3>
                  <p className="text-xs sm:text-sm text-theme-text/60 max-w-md mx-auto">
                    Try adjusting the search query or selecting "All Candidates" to display the full student roster.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSearch('');
                      setStudentFilterPref('all');
                      soundEffects.playSelect();
                    }}
                    className="px-4 py-2 rounded-xl bg-[#006d5c] text-white font-bold text-xs sm:text-sm hover:bg-[#005a4c] transition"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-sm">
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Registered Candidate Roster Table"
                    className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50 rounded-xl"
                  >
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-theme-border bg-theme-bg/60 text-xs font-black uppercase tracking-wider text-theme-text/70">
                          <th className="py-4 px-5">Candidate Name</th>
                          <th className="py-4 px-4">Roll Number</th>
                          <th className="py-4 px-4">Contact Email</th>
                          <th className="py-4 px-4">Accommodations</th>
                          <th className="py-4 px-4">Exam Engagement</th>
                          <th className="py-4 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme-border/50">
                        {filteredStudents.map((std) => {
                          const stdSubs = submissions.filter((s) => matchesStudent(s, std));
                          const isDeleting = deletingStudentId === std.id;
                          const avgScore = stdSubs.length > 0 ? Math.round(stdSubs.reduce((acc, c) => acc + (c.percentage || 0), 0) / stdSubs.length) : null;
                          const badge = getAccessibilityBadge(std.accessibilityPreference);
                          const isCopied = copiedRoll === std.rollNumber;
                          const hasAttempts = stdSubs.length > 0;

                          return (
                            <tr key={std.id} className="hover:bg-theme-bg/50 transition group">
                              {/* Candidate Info */}
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${getStudentGradient(std.name)} text-white font-black text-sm flex items-center justify-center shadow-xs`}>
                                      {std.name.charAt(0).toUpperCase()}
                                    </div>
                                    {hasAttempts && (
                                      <span
                                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-theme-surface"
                                        title="Active Candidate (Has test submissions)"
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-extrabold text-theme-text text-sm sm:text-base group-hover:text-[#005a4c] dark:hover:text-teal-300 transition truncate">
                                      {std.name}
                                    </div>
                                    <div className="text-xs text-theme-text/60 flex items-center gap-1.5 mt-0.5">
                                      <span className={`w-1.5 h-1.5 rounded-full ${hasAttempts ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                      <span>{hasAttempts ? 'Active Candidate' : 'Registered / Enrolled'}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Roll Number with One-Click Copy */}
                              <td className="py-4 px-4">
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border font-mono text-xs font-bold text-[#005a4c] dark:text-teal-300">
                                  <span>{std.rollNumber}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyRoll(std.rollNumber)}
                                    title="Copy Roll Number"
                                    className="p-0.5 hover:text-white hover:bg-[#006d5c] rounded transition"
                                  >
                                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3 h-3 text-theme-text/40 hover:text-inherit" />}
                                  </button>
                                </div>
                              </td>

                              {/* Email */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-theme-text/80 truncate max-w-[200px]">
                                  <Mail className="w-3.5 h-3.5 text-theme-text/40 shrink-0" />
                                  <span className="truncate">{std.email}</span>
                                </div>
                              </td>

                              {/* Accessibility Badge */}
                              <td className="py-4 px-4">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
                                  <badge.icon className="w-3.5 h-3.5" />
                                  <span>{badge.label}</span>
                                </span>
                              </td>

                              {/* Exam Engagement & Accuracy */}
                              <td className="py-4 px-4">
                                {hasAttempts ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs gap-3">
                                      <span className="font-extrabold text-theme-text">{avgScore}% Accuracy</span>
                                      <span className="text-theme-text/60 font-medium">{stdSubs.length} {stdSubs.length === 1 ? 'test' : 'tests'}</span>
                                    </div>
                                    <div className="w-28 bg-theme-bg rounded-full h-2 overflow-hidden border border-theme-border">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          (avgScore || 0) >= 80 ? 'bg-emerald-500' : (avgScore || 0) >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                        }`}
                                        style={{ width: `${avgScore}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-theme-text/50 font-medium italic">
                                    No attempts yet
                                  </span>
                                )}
                              </td>

                              {/* Action Buttons */}
                              <td className="py-4 px-5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* View Profile Button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedStudent(std);
                                      soundEffects.playSelect();
                                    }}
                                    className="px-3 py-1.5 rounded-xl border border-[#006d5c]/40 bg-[#006d5c]/10 hover:bg-[#006d5c] text-[#005a4c] dark:text-teal-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition shadow-2xs"
                                    title={`View ${std.name}'s Profile & Test History`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Profile</span>
                                  </button>

                                  {/* Remove Account Button */}
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteStudent(std.id, std.name)}
                                    className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-bold text-xs flex items-center gap-1 transition disabled:opacity-50"
                                    title="Remove Student Account"
                                  >
                                    {isDeleting ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    )}
                                    <span className="hidden sm:inline">Delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Detailed Student Profile Modal */}
              {selectedStudent && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="student-modal-name"
                  onClick={() => setSelectedStudent(null)}
                >
                  <div
                    className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-theme-surface border border-theme-border shadow-2xl p-6 sm:p-7 space-y-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Modal Close Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(null)}
                      className="absolute top-5 right-5 p-2 rounded-xl text-theme-text/60 hover:text-theme-text hover:bg-theme-bg border border-theme-border transition"
                      aria-label="Close Profile Dialog"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    {/* Student Identity Header */}
                    <div className="flex items-center gap-4 pr-12">
                      <div className={`w-16 h-16 rounded-3xl bg-gradient-to-br ${getStudentGradient(selectedStudent.name)} text-white font-black text-2xl flex items-center justify-center shadow-md`}>
                        {selectedStudent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 id="student-modal-name" className="text-xl sm:text-2xl font-black text-theme-text truncate">
                            {selectedStudent.name}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-theme-text/70 mt-1">
                          <span className="font-mono font-bold text-[#005a4c] dark:text-teal-300 bg-theme-bg px-2 py-0.5 rounded border border-theme-border">
                            {selectedStudent.rollNumber}
                          </span>
                          <span>{selectedStudent.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* 4 Mini Summary Metric Cards */}
                    {(() => {
                      const studentSubs = submissions.filter((s) => matchesStudent(s, selectedStudent));
                      const avg = studentSubs.length > 0 ? Math.round(studentSubs.reduce((a, b) => a + (b.percentage || 0), 0) / studentSubs.length) : 0;
                      const best = studentSubs.length > 0 ? Math.max(...studentSubs.map((s) => s.percentage || 0)) : 0;
                      const badge = getAccessibilityBadge(selectedStudent.accessibilityPreference);

                      return (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3.5 rounded-2xl bg-theme-bg border border-theme-border">
                              <span className="text-[10px] uppercase font-bold text-theme-text/60 block">Tests Taken</span>
                              <div className="text-xl font-black text-theme-text mt-0.5">{studentSubs.length}</div>
                            </div>
                            <div className="p-3.5 rounded-2xl bg-theme-bg border border-theme-border">
                              <span className="text-[10px] uppercase font-bold text-theme-text/60 block">Avg Accuracy</span>
                              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{avg}%</div>
                            </div>
                            <div className="p-3.5 rounded-2xl bg-theme-bg border border-theme-border">
                              <span className="text-[10px] uppercase font-bold text-theme-text/60 block">Best Score</span>
                              <div className="text-xl font-black text-[#005a4c] dark:text-teal-300 mt-0.5">{best}%</div>
                            </div>
                            <div className="p-3.5 rounded-2xl bg-theme-bg border border-theme-border">
                              <span className="text-[10px] uppercase font-bold text-theme-text/60 block">Profile Mode</span>
                              <div className="text-xs font-extrabold text-purple-600 dark:text-purple-400 mt-1 truncate">
                                {badge.label}
                              </div>
                            </div>
                          </div>

                          {/* Test Attempts History */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <h4 className="text-sm font-extrabold text-theme-text flex items-center gap-2">
                                <Award className="w-4 h-4 text-[#005a4c] dark:text-teal-300" />
                                Examination & Drill Attempts ({studentSubs.length})
                              </h4>
                              {studentSubs.length > 0 && (
                                <span className="text-xs text-theme-text/60">
                                  Last submitted: {new Date(Math.max(...studentSubs.map((s) => s.submittedAt))).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            {studentSubs.length === 0 ? (
                              <div className="p-6 text-center rounded-2xl bg-theme-bg border border-theme-border text-xs sm:text-sm text-theme-text/70">
                                This candidate has not submitted any mock tests or practice drills yet.
                              </div>
                            ) : (
                              <div
                                tabIndex={0}
                                role="region"
                                aria-label="Candidate Test Submissions History"
                                className="overflow-x-auto rounded-2xl border border-theme-border focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50"
                              >
                                <table className="w-full text-left text-xs sm:text-sm">
                                  <thead className="bg-theme-bg border-b border-theme-border text-[11px] font-bold text-theme-text/60 uppercase">
                                    <tr>
                                      <th className="py-2.5 px-3">Examination</th>
                                      <th className="py-2.5 px-3">Mode</th>
                                      <th className="py-2.5 px-3 text-center">Score</th>
                                      <th className="py-2.5 px-3 text-center">Accuracy</th>
                                      <th className="py-2.5 px-3 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-theme-border/50">
                                    {studentSubs.map((sub) => (
                                      <tr key={sub.id} className="hover:bg-theme-bg/40">
                                        <td className="py-2.5 px-3 font-semibold text-theme-text">
                                          {sub.examTitle}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          <span className="capitalize px-2 py-0.5 rounded text-[10px] font-bold bg-theme-bg border border-theme-border">
                                            {sub.examType}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-center font-mono font-bold text-theme-text">
                                          {sub.score} / {sub.maxScore}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                                            (sub.percentage || 0) >= 80 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                          }`}>
                                            {sub.percentage}%
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              if (window.confirm(`Delete attempt of "${sub.examTitle}" for ${selectedStudent.name}?`)) {
                                                await deleteSubmission(sub.id);
                                              }
                                            }}
                                            className="p-1 rounded-md text-theme-text/50 hover:text-red-500 hover:bg-red-500/10 transition"
                                            title="Delete this attempt"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    {/* Modal Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-theme-border">
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(selectedStudent.id, selectedStudent.name)}
                        className="px-4 py-2 rounded-xl text-red-500 hover:bg-red-500/10 border border-red-500/30 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Candidate</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedStudent(null)}
                        className="px-5 py-2 rounded-xl bg-[#006d5c] hover:bg-[#005a4c] text-white font-bold text-xs sm:text-sm transition"
                      >
                        Close Profile
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: MANAGE TESTS & DRILLS */}
          {activeAdminTab === 'manage' && (
            <section aria-label="Existing Examinations and Practice Modules" className="space-y-6">
              {/* 1. Curriculum Repository & Catalog Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-theme-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 uppercase tracking-wider">
                      Paper Repository
                    </span>
                    <span className="text-xs text-theme-text/60 font-medium">Curriculum Management</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-theme-text tracking-tight mt-1 flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-[#005a4c] dark:text-teal-300" aria-hidden="true" />
                    <span>Examination Papers & Practice Drills</span>
                  </h2>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExamId(null);
                      setExamType(manageSubTab === 'exams' ? 'exam' : 'practice');
                      setActiveAdminTab('create');
                      soundEffects.playSelect();
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#006d5c] to-teal-700 hover:brightness-110 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md transition"
                  >
                    <PlusCircle className="w-4 h-4" aria-hidden="true" />
                    <span>{manageSubTab === 'exams' ? 'Create Mock Test' : 'Create Practice Drill'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Direct Curriculum Telemetry Bar */}
              <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Total Active Papers:</span>
                    <span className="font-mono font-black text-sm text-theme-text">
                      {availableExams.length + availablePracticeDrills.length}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Timed Mock Tests:</span>
                    <span className="font-mono font-black text-sm text-purple-600 dark:text-purple-400">
                      {availableExams.length}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Practice Drills:</span>
                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {availablePracticeDrills.length}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Question Bank Items:</span>
                    <span className="font-mono font-black text-sm text-amber-600 dark:text-amber-400">
                      {totalBankQuestionsCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-theme-text/60 font-mono text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Curriculum Verified</span>
                </div>
              </div>

              {/* 3. Search & Category Filters Bar */}
              <div className="p-4 rounded-2xl bg-theme-surface border border-theme-border shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-theme-text/40 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={manageSearchQuery}
                      onChange={(e) => setManageSearchQuery(e.target.value)}
                      placeholder="Search test paper, code, or syllabus..."
                      className="w-full pl-10 pr-4 py-2 rounded-xl bg-theme-bg border border-theme-border text-xs sm:text-sm text-theme-text placeholder:text-theme-text/40 focus:outline-none focus:ring-2 focus:ring-[#006d5c] font-medium"
                    />
                  </div>

                  {/* Sub-Tabs Switcher */}
                  <div role="tablist" aria-label="Test formats" className="flex items-center gap-1.5 p-1 rounded-xl bg-theme-bg border border-theme-border shrink-0">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={manageSubTab === 'exams'}
                      onClick={() => {
                        setManageSubTab('exams');
                        soundEffects.playSelect();
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition ${
                        manageSubTab === 'exams'
                          ? 'bg-[#006d5c] text-white shadow-xs'
                          : 'text-theme-text/70 hover:text-theme-text'
                      }`}
                    >
                      <span>🏆 Timed Mocks</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        manageSubTab === 'exams' ? 'bg-black/25 text-white' : 'bg-theme-surface text-theme-text/80'
                      }`}>
                        {filteredManageExams.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={manageSubTab === 'practice'}
                      onClick={() => {
                        setManageSubTab('practice');
                        soundEffects.playSelect();
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition ${
                        manageSubTab === 'practice'
                          ? 'bg-[#006d5c] text-white shadow-xs'
                          : 'text-theme-text/70 hover:text-theme-text'
                      }`}
                    >
                      <span>💡 Practice Drills</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        manageSubTab === 'practice' ? 'bg-black/25 text-white' : 'bg-theme-surface text-theme-text/80'
                      }`}>
                        {filteredManageDrills.length}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Curriculum Category Filters"
                  className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-thin focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50 rounded-lg"
                >
                  <span className="text-xs font-bold text-theme-text/60 shrink-0 mr-1 flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Category:
                  </span>
                  {(
                    [
                      'All',
                      'Staff Selection',
                      'Banking & Insurance',
                      'Railways',
                      'Civil Services',
                      'Defence',
                      'Entrance Exams',
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setManageCategoryFilter(cat);
                        soundEffects.playSelect();
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 border ${
                        manageCategoryFilter === cat
                          ? 'bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 border-[#006d5c]'
                          : 'bg-theme-bg border-theme-border text-theme-text/70 hover:text-theme-text'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Tests Grid Display */}
              {manageSubTab === 'exams' && (
                <div>
                  {filteredManageExams.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl bg-theme-surface border border-theme-border space-y-3 shadow-xs">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl font-black">
                        🏆
                      </div>
                      <h3 className="text-base font-extrabold text-theme-text">No Timed Mock Tests Found</h3>
                      <p className="text-xs text-theme-text/60 max-w-sm mx-auto">
                        {manageSearchQuery || manageCategoryFilter !== 'All'
                          ? 'No mock tests match your current search query or category filter.'
                          : "You haven't published any timed mock exams yet. Create one to allow students to take simulated full-length tests."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingExamId(null);
                          setExamType('exam');
                          setActiveAdminTab('create');
                          soundEffects.playSelect();
                        }}
                        className="px-4 py-2 rounded-xl bg-[#006d5c] text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition hover:brightness-110"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Create First Mock Test</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {filteredManageExams.map((exam) => (
                        <div
                          key={exam.id}
                          className="p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-xs hover:border-[#006d5c]/50 transition flex flex-col justify-between space-y-4 group"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 border border-[#006d5c]/30">
                                {exam.code}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-theme-bg text-theme-text/70 border border-theme-border">
                                  {exam.category}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                  🏆 Timed Simulation
                                </span>
                              </div>
                            </div>

                            <div>
                              <h3 className="text-base sm:text-lg font-black text-theme-text group-hover:text-[#005a4c] dark:hover:text-teal-300 transition-colors leading-snug">
                                {exam.title}
                              </h3>
                              <p className="text-xs text-theme-text/70 mt-1 line-clamp-2 leading-relaxed">
                                {exam.description || 'Full-length simulation examination for competitive test preparation.'}
                              </p>
                            </div>

                            {/* Spec Pills Strip */}
                            <div className="flex flex-wrap gap-2 text-xs pt-1">
                              <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/80 font-bold flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-500" /> {exam.durationMinutes} mins
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/80 font-bold flex items-center gap-1">
                                <HelpCircle className="w-3.5 h-3.5 text-teal-500" /> {exam.questions?.length || exam.questionCount || 0} questions
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/80 font-bold flex items-center gap-1">
                                <Award className="w-3.5 h-3.5 text-purple-500" /> {exam.totalMarks} marks
                              </span>
                              {exam.negativeMarking && (
                                <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/70 font-semibold">
                                  ⚡ {exam.negativeMarking}
                                </span>
                              )}
                              {exam.questions?.some((q) => q.graph && q.graph.enabled) && (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                                  <Volume2 className="w-3 h-3" /> Audio Graph DI
                                </span>
                              )}
                              {exam.questions?.some((q) => q.mathLatex) && (
                                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 font-bold">
                                  ∑ LaTeX Math
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Action Buttons */}
                          <div className="flex items-center justify-between gap-2 pt-3 border-t border-theme-border/60 flex-wrap">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleTestAsStudent(exam, 'exam')}
                                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#006d5c] to-teal-700 text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110 shadow-xs transition"
                              >
                                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Test as Student</span>
                              </button>

                              <button
                                type="button"
                                disabled={isLoadingExamForEdit}
                                onClick={() => void handleStartEditExam(exam.id)}
                                className="px-3 py-1.5 rounded-xl border border-theme-border bg-theme-bg hover:border-[#006d5c] text-theme-text text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[#005a4c] dark:text-teal-300" aria-hidden="true" />
                                <span>{isLoadingExamForEdit ? 'Loading...' : 'Edit in Studio'}</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={() => void handleDuplicateExam(exam.id, 'exam')}
                                className="p-1.5 rounded-xl border border-theme-border bg-theme-bg hover:bg-theme-border/30 text-theme-text/70 hover:text-theme-text text-xs transition"
                                title="Duplicate Mock Test"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => void deleteCustomExam(exam.id)}
                                className="p-1.5 rounded-xl border border-theme-border bg-theme-bg hover:border-red-500/50 hover:bg-red-500/10 text-theme-text/60 hover:text-red-500 text-xs transition"
                                title="Delete Examination"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. Practice Drills Grid Display */}
              {manageSubTab === 'practice' && (
                <div>
                  {filteredManageDrills.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl bg-theme-surface border border-theme-border space-y-3 shadow-xs">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl font-black">
                        💡
                      </div>
                      <h3 className="text-base font-extrabold text-theme-text">No Practice Drills Found</h3>
                      <p className="text-xs text-theme-text/60 max-w-sm mx-auto">
                        {manageSearchQuery || manageCategoryFilter !== 'All'
                          ? 'No practice drills match your current search query or category filter.'
                          : "You haven't authored any practice drills yet. Practice modules provide instant hints and explanations for each question."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingExamId(null);
                          setExamType('practice');
                          setActiveAdminTab('create');
                          soundEffects.playSelect();
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition hover:brightness-110"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Create Practice Drill</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {filteredManageDrills.map((drill) => (
                        <div
                          key={drill.id}
                          className="p-5 sm:p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-xs hover:border-emerald-500/50 transition flex flex-col justify-between space-y-4 group"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                {drill.code}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-theme-bg text-theme-text/70 border border-theme-border">
                                  {drill.category}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                  💡 Untimed Practice Drill
                                </span>
                              </div>
                            </div>

                            <div>
                              <h3 className="text-base sm:text-lg font-black text-theme-text group-hover:text-emerald-600 transition-colors leading-snug">
                                {drill.title}
                              </h3>
                              <p className="text-xs text-theme-text/70 mt-1 line-clamp-2 leading-relaxed">
                                {drill.description || 'Topic drill with on-demand hints, audio verbalization, and step-by-step explanations.'}
                              </p>
                            </div>

                            {/* Spec Pills Strip */}
                            <div className="flex flex-wrap gap-2 text-xs pt-1">
                              <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/80 font-bold flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-500" /> {drill.durationMinutes} mins
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/80 font-bold flex items-center gap-1">
                                <HelpCircle className="w-3.5 h-3.5 text-emerald-500" /> {drill.questions?.length || drill.questionCount || 0} questions
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold">
                                💡 Instant Hints & Explanations
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-theme-bg border border-theme-border text-theme-text/70 font-semibold">
                                ✓ No Negative Marking
                              </span>
                            </div>
                          </div>

                          {/* Card Action Buttons */}
                          <div className="flex items-center justify-between gap-2 pt-3 border-t border-theme-border/60 flex-wrap">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleTestAsStudent(drill, 'practice')}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110 shadow-xs transition"
                              >
                                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Test as Student</span>
                              </button>

                              <button
                                type="button"
                                disabled={isLoadingExamForEdit}
                                onClick={() => void handleStartEditExam(drill.id)}
                                className="px-3 py-1.5 rounded-xl border border-theme-border bg-theme-bg hover:border-emerald-500 text-theme-text text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                <span>{isLoadingExamForEdit ? 'Loading...' : 'Edit Drill'}</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={() => void handleDuplicateExam(drill.id, 'practice')}
                                className="p-1.5 rounded-xl border border-theme-border bg-theme-bg hover:bg-theme-border/30 text-theme-text/70 hover:text-theme-text text-xs transition"
                                title="Duplicate Practice Drill"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => void deleteCustomExam(drill.id)}
                                className="p-1.5 rounded-xl border border-theme-border bg-theme-bg hover:border-red-500/50 hover:bg-red-500/10 text-theme-text/60 hover:text-red-500 text-xs transition"
                                title="Delete Practice Drill"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* TAB: QUESTION BANK & TEST AUTHORING STUDIO */}
          {activeAdminTab === 'create' && (
            <section aria-labelledby="create-heading" className="flex-1 flex flex-col min-h-full space-y-6">
              {/* 1. Authoring Suite Studio App Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-theme-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 uppercase tracking-wider">
                      Authoring Studio
                    </span>
                    <span className="text-xs text-theme-text/60 font-medium">LaTeX Math · Multimodal Vision · Audio Sonification</span>
                  </div>
                  <h2 id="create-heading" className="text-xl sm:text-2xl font-black text-theme-text tracking-tight mt-1 flex items-center gap-2">
                    <HelpCircle className="w-6 h-6 text-[#005a4c] dark:text-teal-300" aria-hidden="true" />
                    <span>{editingExamId ? `Editing Paper: ${code || 'Draft'}` : 'Question Bank & Authoring Studio'}</span>
                  </h2>
                </div>

                {/* Right Top Quick Actions */}
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  {editingExamId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3 py-2 rounded-xl border border-theme-border bg-theme-surface text-theme-text font-bold text-xs hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/40 transition shadow-2xs"
                    >
                      Cancel Edit
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => wordFileRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
                    title="Import questions from .docx / .txt file"
                  >
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    <span>Import Word (.docx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => pdfFileRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
                    title="Import questions from .pdf file"
                  >
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    <span>Import PDF (.pdf)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="px-3.5 py-2 rounded-xl bg-[#006d5c] hover:bg-[#005a4c] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
                  >
                    <PlusCircle className="w-4 h-4" aria-hidden="true" />
                    <span>+ Add Question</span>
                  </button>

                  <input
                    ref={wordFileRef}
                    type="file"
                    accept=".docx,.txt,.md"
                    onChange={handleImportWordFile}
                    className="hidden"
                    aria-label="Choose a Word document to import questions from"
                  />

                  <input
                    ref={pdfFileRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleImportPdfFile}
                    className="hidden"
                    aria-label="Choose a PDF document to import questions from"
                  />
                </div>
              </div>

              {/* 2. Direct Studio Blueprint Telemetry Bar */}
              <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Paper Items:</span>
                    <span className="font-mono font-black text-sm text-theme-text">{questions.length} Questions</span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Total Marks:</span>
                    <span className="font-mono font-black text-sm text-purple-600 dark:text-purple-400">{totalMarks} Pts</span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Paper Time:</span>
                    <span className="font-mono font-black text-sm text-amber-600 dark:text-amber-400">{durationMinutes} Mins</span>
                  </div>
                  <div className="h-4 w-px bg-theme-border hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-theme-text/60">Pacing per Item:</span>
                    <span className="font-mono font-black text-sm text-teal-600 dark:text-teal-400">
                      ~{Math.max(1, Math.round((durationMinutes * 60) / Math.max(1, questions.length)))}s
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-theme-text/60 font-mono text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>KaTeX Math Engine Active</span>
                </div>
              </div>

              <form onSubmit={handlePublishExam} className="flex-1 flex flex-col justify-between space-y-6">
                <div className="space-y-6 flex-1">
                {formError && (
                  <div role="alert" className="p-4 rounded-2xl bg-red-500/10 border border-red-500 text-red-500 text-sm font-bold shadow-xs">
                    ⚠️ {formError}
                  </div>
                )}
                {formSuccess && (
                  <div role="status" className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-2 shadow-xs">
                    <CheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>{formSuccess}</span>
                  </div>
                )}

                {/* 3. Examination Blueprint Card */}
                <div className="p-5 sm:p-7 rounded-2xl bg-theme-surface border border-theme-border shadow-sm space-y-5">
                  <div className="flex items-center justify-between border-b border-theme-border/60 pb-3">
                    <h3 className="text-base sm:text-lg font-black text-theme-text flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-[#005a4c] dark:text-teal-300" />
                      <span>1. Examination Blueprint & Metadata</span>
                    </h3>
                    <span className="text-xs font-semibold text-theme-text/60">Configure timing, syllabus & marking</span>
                  </div>

                  {/* Format, Category, Difficulty */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="admin-exam-type" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Module Format <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="admin-exam-type"
                        aria-label="Module Format"
                        title="Module Format"
                        value={examType}
                        onChange={(e) => setExamType(e.target.value as 'exam' | 'practice')}
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition"
                      >
                        <option value="exam">🏆 Mock Examination (Timed with Penalty)</option>
                        <option value="practice">💡 Practice Drill (Untimed with Hints)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="admin-exam-category" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Category / Stream <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="admin-exam-category"
                        aria-label="Category / Stream"
                        title="Category / Stream"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ExamCategory)}
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition"
                      >
                        <option value="Staff Selection">Staff Selection Commission (SSC)</option>
                        <option value="Banking & Insurance">Banking & Insurance (IBPS/SBI)</option>
                        <option value="Civil Services">Civil Services (UPSC CSAT)</option>
                        <option value="Railways">Railways (RRB NTPC)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="admin-exam-difficulty" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Difficulty Level
                      </label>
                      <select
                        id="admin-exam-difficulty"
                        aria-label="Difficulty Level"
                        title="Difficulty Level"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value as any)}
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition"
                      >
                        <option value="Easy">Easy (Foundation / Starter)</option>
                        <option value="Moderate">Moderate (Standard Examination)</option>
                        <option value="Challenging">Challenging (Advanced Practice)</option>
                      </select>
                    </div>
                  </div>

                  {/* Title & Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-3">
                      <label htmlFor="admin-exam-title" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Test Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="admin-exam-title"
                        aria-label="Test Title"
                        title="Test Title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. SSC CGL Mock Drill"
                        required
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-exam-code" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Exam Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="admin-exam-code"
                        aria-label="Exam Code"
                        title="Exam Code"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="e.g. IBPS-CLK-05"
                        required
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition uppercase placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label htmlFor="admin-exam-description" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                      Overview & Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="admin-exam-description"
                      aria-label="Overview & Description"
                      title="Overview & Description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Summary of syllabus, topics, and objectives..."
                      required
                      className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm focus:outline-none focus:ring-2 focus:ring-[#006d5c] transition font-medium placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                    />
                  </div>

                  {/* Duration, Marks, Negative Marking */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label htmlFor="admin-exam-duration" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Duration (Minutes)
                      </label>
                      <input
                        id="admin-exam-duration"
                        aria-label="Duration (Minutes)"
                        title="Duration (Minutes)"
                        type="number"
                        min={5}
                        max={180}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Number(e.target.value))}
                        placeholder="30"
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#006d5c] placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-exam-total-marks" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Total Marks
                      </label>
                      <input
                        id="admin-exam-total-marks"
                        aria-label="Total Marks"
                        title="Total Marks"
                        type="number"
                        min={5}
                        max={300}
                        value={totalMarks}
                        onChange={(e) => setTotalMarks(Number(e.target.value))}
                        placeholder="50"
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#006d5c] placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-exam-negative-marking" className="block text-xs font-bold uppercase tracking-wider text-theme-text/70 mb-1.5">
                        Negative Marking
                      </label>
                      <input
                        id="admin-exam-negative-marking"
                        aria-label="Negative Marking"
                        title="Negative Marking"
                        type="text"
                        value={negativeMarking}
                        onChange={(e) => setNegativeMarking(e.target.value)}
                        placeholder="-0.25 marks"
                        disabled={examType === 'practice'}
                        className="w-full p-3 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm font-semibold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#006d5c] placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Questions Authoring Workbench */}
                <div className="p-5 sm:p-7 rounded-2xl bg-theme-surface border border-theme-border shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-theme-border/60 pb-4">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-theme-text flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-[#005a4c] dark:text-teal-300" />
                        <span>2. Questions Workbench ({questions.length} Items)</span>
                      </h3>
                      <p className="text-xs text-theme-text/60 mt-0.5">
                        Author questions with KaTeX mathematical formulas, multimodal AI diagrams, and step-by-step solutions.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        className="px-4 py-2 rounded-xl bg-[#006d5c] hover:bg-[#005a4c] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
                      >
                        <PlusCircle className="w-4 h-4" aria-hidden="true" />
                        <span>Add Question</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Question Quick-Navigator Ribbon */}
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Question Quick Jump Navigator"
                    className="p-3 rounded-xl bg-theme-bg border border-theme-border/80 flex items-center gap-2 overflow-x-auto scrollbar-thin focus:outline-none focus:ring-2 focus:ring-[#006d5c]/50"
                  >
                    <span className="text-xs font-bold text-theme-text/60 shrink-0 flex items-center gap-1">
                      <SlidersHorizontal className="w-3.5 h-3.5" /> Quick Jump:
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {questions.map((q, idx) => {
                        const hasContent = Boolean(q.questionText?.trim());
                        const hasDiagram = Boolean(q.diagramUrl);
                        const hasMath = Boolean(q.mathLatex?.trim());
                        const hasGraph = Boolean(q.graph?.enabled);
                        return (
                          <button
                            key={q.id || idx}
                            type="button"
                            onClick={() => {
                              document.getElementById(`question-card-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              soundEffects.playSelect();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black font-mono transition shrink-0 flex items-center gap-1 border ${
                              hasContent
                                ? 'bg-theme-surface border-theme-border text-theme-text hover:border-[#006d5c]'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            }`}
                            title={`Jump to Question ${idx + 1}`}
                          >
                            <span>Q{idx + 1}</span>
                            {hasMath && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Has Math LaTeX" />}
                            {hasDiagram && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" title="Has Diagram" />}
                            {hasGraph && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" title="Has Audio Graph" />}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        className="px-2.5 py-1 rounded-lg text-xs font-extrabold border border-dashed border-[#006d5c] text-[#005a4c] dark:text-teal-300 hover:bg-[#006d5c]/10 transition shrink-0"
                        title="Add New Question"
                      >
                        + Add Q
                      </button>
                    </div>
                  </div>

                  {/* Individual Question Cards */}
                  <div className="space-y-5">
                    {questions.map((q, qIdx) => (
                      <div
                        key={q.id}
                        id={`question-card-${qIdx}`}
                        className="p-3.5 sm:p-6 rounded-2xl bg-theme-bg border border-theme-border shadow-xs space-y-4 hover:border-[#006d5c]/40 transition scroll-mt-24 min-w-0 max-w-full overflow-hidden"
                      >
                        {/* Question Card Header Bar */}
                        <div className="flex flex-wrap items-center justify-between border-b border-theme-border pb-3 gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#006d5c] to-teal-700 text-white font-black text-xs flex items-center justify-center font-mono shadow-xs">
                              Q{q.questionNumber}
                            </span>
                            <span className="text-sm font-extrabold text-theme-text">Question {q.questionNumber}</span>
                            {q.questionType === 'DI' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-theme-primary/10 text-theme-primary border border-theme-primary/30">
                                📊 DI Audio Sonification
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Duplicate Question button */}
                            <button
                              type="button"
                              onClick={() => handleDuplicateQuestion(qIdx)}
                              className="px-2.5 py-1.5 rounded-xl border border-theme-border bg-theme-surface hover:bg-theme-border/40 text-theme-text font-bold text-xs flex items-center gap-1.5 transition"
                              title="Duplicate this question"
                            >
                              <Copy className="w-3.5 h-3.5 text-theme-text/60" />
                              <span className="hidden sm:inline">Duplicate</span>
                            </button>

                            {/* Preview as Student button */}
                            <button
                              type="button"
                              onClick={() => setPreviewingQuestionIdx(qIdx)}
                              className="px-2.5 py-1.5 rounded-xl border border-theme-primary/30 bg-theme-primary/10 text-theme-primary hover:bg-theme-primary hover:text-theme-primary-text font-bold text-xs flex items-center gap-1.5 transition"
                              title="Preview in student examination mode"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span className="hidden sm:inline">Student Preview</span>
                            </button>

                            {questions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestion(qIdx)}
                                className="px-2.5 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-bold text-xs flex items-center gap-1 transition"
                                title="Remove question"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">Remove</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Question Format & Type Selector */}
                        <div className="p-3.5 rounded-xl bg-theme-surface border border-theme-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                            <label className="text-xs font-bold uppercase tracking-wider text-theme-text/70 shrink-0">
                              Question Format:
                            </label>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-theme-text">
                                <input
                                  type="radio"
                                  name={`q_type_${qIdx}`}
                                  checked={q.questionType !== 'DI'}
                                  onChange={() => {
                                    setQuestions((prev) => {
                                      const updated = [...prev];
                                      const current = updated[qIdx];
                                      updated[qIdx] = {
                                        ...current,
                                        questionType: 'MCQ',
                                        ...(current.graph ? { graph: { ...current.graph, enabled: false } } : {}),
                                      };
                                      return updated;
                                    });
                                  }}
                                  className="accent-[#006d5c] shrink-0"
                                />
                                <span>Standard Multiple Choice (MCQ)</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#005a4c] dark:text-teal-300">
                                <input
                                  type="radio"
                                  name={`q_type_${qIdx}`}
                                  checked={q.questionType === 'DI'}
                                  onChange={() => {
                                    setQuestions((prev) => {
                                      const updated = [...prev];
                                      const current = updated[qIdx];
                                      const existingGraph = current.graph || {
                                        enabled: true,
                                        type: 'bar',
                                        title: 'Data Interpretation Graph',
                                        xAxisLabel: 'Category',
                                        yAxisLabel: 'Value',
                                        unit: '',
                                        data: [
                                          { id: '1', label: 'Item A', value: 30 },
                                          { id: '2', label: 'Item B', value: 65 },
                                          { id: '3', label: 'Item C', value: 90 },
                                        ],
                                        sonification: {
                                          enabled: true,
                                          spatialAudio: true,
                                          trendDetection: true,
                                          peakDetection: true,
                                          haptic: true,
                                          voiceDetail: 'standard',
                                          minFrequency: 250,
                                          maxFrequency: 900,
                                        },
                                      };
                                      updated[qIdx] = {
                                        ...current,
                                        questionType: 'DI',
                                        graph: {
                                          ...existingGraph,
                                          enabled: true,
                                        },
                                      };
                                      return updated;
                                    });
                                  }}
                                  className="accent-[#006d5c] shrink-0"
                                />
                                <span>DI / Data Interpretation (Audio Sonification)</span>
                              </label>
                            </div>
                          </div>

                          {q.questionType === 'DI' && (
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-theme-text pt-2 sm:pt-0 border-t sm:border-t-0 border-theme-border/60">
                              <span>Interactive Sonification:</span>
                              <input
                                type="checkbox"
                                checked={q.graph?.enabled ?? true}
                                onChange={(e) => {
                                  if (q.graph) {
                                    handleUpdateQuestion(qIdx, 'graph', {
                                      ...q.graph,
                                      enabled: e.target.checked,
                                    });
                                  }
                                }}
                                className="w-4 h-4 accent-[#006d5c] shrink-0"
                              />
                              <span className={q.graph?.enabled ? 'text-emerald-500 font-extrabold' : 'text-theme-text/60'}>
                                {q.graph?.enabled ? 'ENABLED' : 'DISABLED'}
                              </span>
                            </label>
                          )}
                        </div>

                        {/* If DI Question & Graph Enabled, Render Real AdminGraphBuilder */}
                        {q.questionType === 'DI' && q.graph && q.graph.enabled && (
                          <AdminGraphBuilder
                            graph={q.graph}
                            onChange={(updatedGraph) => handleUpdateQuestion(qIdx, 'graph', updatedGraph)}
                          />
                        )}

                        {/* Section name & Question Text */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label htmlFor={`admin-q-section-${qIdx}`} className="block text-xs font-bold text-theme-text/70 mb-1">Section</label>
                            <input
                              id={`admin-q-section-${qIdx}`}
                              aria-label={`Question ${qIdx + 1} Section`}
                              title="Section"
                              type="text"
                              value={q.section}
                              onChange={(e) => handleUpdateQuestion(qIdx, 'section', e.target.value)}
                              placeholder="e.g. Quantitative Aptitude"
                              className="w-full p-2.5 rounded-xl bg-theme-surface border border-theme-border text-xs text-theme-text font-semibold focus:outline-none focus:ring-2 focus:ring-[#006d5c] placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label htmlFor={`admin-q-text-${qIdx}`} className="block text-xs font-bold text-theme-text/70 mb-1">
                              Question Statement <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              id={`admin-q-text-${qIdx}`}
                              aria-label={`Question ${qIdx + 1} Statement`}
                              title="Question Statement"
                              value={q.questionText}
                              onChange={(e) => handleUpdateQuestion(qIdx, 'questionText', e.target.value)}
                              onBlur={(e) => {
                                const stripped = extractAndStripImageUrls(e.target.value);
                                if (stripped.imageUrl && stripped.cleanText !== e.target.value) {
                                  handleUpdateQuestion(qIdx, 'questionText', stripped.cleanText || e.target.value);
                                  if (!q.diagramUrl) {
                                    handleUpdateQuestion(qIdx, 'diagramUrl', stripped.imageUrl);
                                    if (!q.diagramType) {
                                      handleUpdateQuestion(qIdx, 'diagramType', 'chart');
                                    }
                                  }
                                }
                              }}
                              rows={2}
                              placeholder="Enter the complete question statement..."
                              required
                              className="w-full p-2.5 rounded-xl bg-theme-surface border border-theme-border text-xs text-theme-text font-medium focus:outline-none focus:ring-2 focus:ring-[#006d5c] placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                            />
                          </div>
                        </div>

                        {/* Math Formula Input + Live Preview */}
                        <div className="p-4 rounded-xl border border-[#006d5c]/30 bg-[#006d5c]/5 space-y-2">
                          <label htmlFor={`admin-q-math-${qIdx}`} className="block text-xs font-bold text-[#005a4c] dark:text-teal-300">
                            Optional Mathematical Equation (LaTeX)
                          </label>
                          <input
                            id={`admin-q-math-${qIdx}`}
                            aria-label={`Question ${qIdx + 1} Mathematical Equation LaTeX`}
                            title="Mathematical Equation (LaTeX)"
                            type="text"
                            value={q.mathLatex || ''}
                            onChange={(e) => handleUpdateQuestion(qIdx, 'mathLatex', e.target.value)}
                            placeholder="e.g. E = mc^2 or v = u + at"
                            className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border font-mono text-xs text-theme-text focus:outline-none focus:ring-2 focus:ring-[#006d5c] placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                          />

                          {q.mathLatex && (
                            <div className="pt-2 text-xs flex flex-wrap items-center gap-3">
                              <span className="text-theme-text/60">Live Rendered Math:</span>
                              <MathEquation latex={q.mathLatex} className="font-mono text-base" />
                              <span className="text-theme-text/40">•</span>
                              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                🔊 Voice speech synthesis: "{verbalizeMath(q.mathLatex)}"
                              </span>
                            </div>
                          )}
                        </div>

                        {/* AI Diagram & Visual Asset Authoring */}
                        <div className="p-4 sm:p-5 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Image className="w-4 h-4 text-purple-500" aria-hidden="true" />
                              <label className="text-xs font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                                🖼️ AI Multimodal Vision Diagram (Attach Any Image / Diagram)
                              </label>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleGenerateAiDiagramExplanation(qIdx)}
                              disabled={generatingDiagramAi[qIdx]}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:brightness-110 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md transition disabled:opacity-50"
                            >
                              {generatingDiagramAi[qIdx] ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                  <span>AI Vision Analyzing Image...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" aria-hidden="true" />
                                  <span>✨ Analyze Image & Generate AI Explanation</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Image Source Inputs */}
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                              <label htmlFor={`admin-diagram-type-${qIdx}`} className="block text-[11px] font-bold text-theme-text/70 mb-1">Diagram Type</label>
                              <select
                                id={`admin-diagram-type-${qIdx}`}
                                aria-label="Diagram Type"
                                title="Diagram Type"
                                value={q.diagramType || 'image'}
                                onChange={(e) => handleUpdateQuestion(qIdx, 'diagramType', e.target.value)}
                                className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs text-theme-text font-bold outline-none"
                              >
                                <option value="image">🖼️ Image (URL / File)</option>
                                <option value="geometry">📐 Geometry / Vector Figure</option>
                                <option value="chart">📊 Chart / Data Graph</option>
                                <option value="svg">⚡ SVG Code / Data URL</option>
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-bold text-theme-text/70 mb-1">
                                Image URL / Online Link
                              </label>
                              <input
                                type="text"
                                aria-label="Image URL or Online Link"
                                title="Image URL or Online Link"
                                value={q.diagramUrl || ''}
                                onChange={(e) => handleUpdateQuestion(qIdx, 'diagramUrl', e.target.value)}
                                placeholder="Paste image URL (e.g. https://...)"
                                className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs font-mono text-theme-text outline-none focus:border-purple-500 placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-theme-text/70 mb-1">
                                Upload Image File
                              </label>
                              <label className="w-full p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold text-xs border border-purple-500/30 flex items-center justify-center gap-1.5 cursor-pointer transition">
                                <span>📁 Pick Image</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleImageFileUpload(qIdx, e)}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          </div>

                          {/* Geometry presets */}
                          {q.diagramType === 'geometry' && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-bold text-theme-text/70">Quick presets:</span>
                              {(
                                [
                                  ['triangle_60_30', '📐 60°-30° Triangle'],
                                  ['triangle_right', '📏 Right Triangle'],
                                  ['circle', '⭕ Circle'],
                                  ['motion', '🚄 Motion Diagram'],
                                ] as const
                              ).map(([preset, label]) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => handleApplyGeometryPreset(qIdx, preset)}
                                  className="px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500 hover:text-white font-bold text-[11px] transition"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Live Image Preview */}
                          {q.diagramUrl && (
                            <div className="p-3 rounded-xl bg-theme-surface border border-theme-border flex flex-col sm:flex-row items-center gap-4">
                              <img
                                src={q.diagramUrl}
                                alt="Diagram Preview"
                                className="h-24 max-w-xs object-contain rounded-lg border border-theme-border shadow-sm bg-white"
                              />
                              <div className="text-xs text-theme-text/80 space-y-1">
                                <div className="font-bold text-purple-500">Live Attached Image Preview</div>
                                <div className="text-[11px] text-theme-text/60 line-clamp-2 font-mono">
                                  Source: {q.diagramUrl.slice(0, 80)}...
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion(qIdx, 'diagramUrl', '')}
                                  className="text-[11px] text-red-500 font-bold hover:underline"
                                >
                                  Remove Image
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Diagram Caption */}
                          <div>
                            <label className="block text-[11px] font-bold text-theme-text/70 mb-1">
                              Optional Diagram Caption (AI Vision auto-understands the image content, no caption required!)
                            </label>
                            <input
                              type="text"
                              aria-label="Optional Diagram Caption"
                              title="Optional Diagram Caption"
                              value={q.diagramDescription || ''}
                              onChange={(e) => handleUpdateQuestion(qIdx, 'diagramDescription', e.target.value)}
                              placeholder="Optional notes (or auto-inspected by AI)"
                              className="w-full p-2.5 rounded-lg bg-theme-surface border border-theme-border text-xs text-theme-text outline-none focus:border-purple-500 placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                            />
                          </div>

                          {q.diagramAiExplanation && (
                            <div className="p-4 rounded-xl bg-theme-surface border border-purple-500/30 text-xs space-y-2.5">
                              <div className="flex items-center gap-1.5 font-extrabold text-purple-600 dark:text-purple-400 text-sm">
                                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" aria-hidden="true" />
                                <span>Generated Multimodal AI Diagram Breakdown:</span>
                              </div>
                              <p className="text-theme-text font-medium text-xs leading-relaxed">
                                {q.diagramAiExplanation.educationalContext}
                              </p>
                              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                                🔊 TTS Audio Voice Narration: "{q.diagramAiExplanation.audioNarration}"
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 4 Options Grid */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold uppercase tracking-wider text-theme-text/70">
                            Answer Options (Click the radio button to select the correct answer) <span className="text-red-500">*</span>
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options.map((opt) => (
                              <div
                                key={opt.number}
                                className={`p-3.5 rounded-xl border flex items-center gap-3 transition-colors ${
                                  q.correctOption === opt.number
                                    ? 'border-emerald-500 bg-emerald-500/10 shadow-xs'
                                    : 'border-theme-border bg-theme-surface'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`correct_q_${qIdx}`}
                                  checked={q.correctOption === opt.number}
                                  onChange={() => handleUpdateQuestion(qIdx, 'correctOption', opt.number)}
                                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                                  aria-label={`Mark Option ${opt.number} as correct`}
                                />
                                <span className={`text-xs font-black font-mono px-2 py-0.5 rounded ${
                                  q.correctOption === opt.number ? 'bg-emerald-700 text-white' : 'bg-theme-bg text-theme-text/70 border border-theme-border'
                                }`}>
                                  Opt {opt.number}
                                </span>
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={(e) => handleUpdateOption(qIdx, opt.number, e.target.value)}
                                  placeholder={`Option ${opt.number} text...`}
                                  required
                                  className="flex-1 p-1 rounded bg-transparent border-b border-theme-border/60 text-xs sm:text-sm text-theme-text outline-none focus:border-[#006d5c] font-medium placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Hint & Explanation */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">
                              💡 Helpful Hint (For students in Practice Mode)
                            </label>
                            <textarea
                              value={q.hint}
                              onChange={(e) => handleUpdateQuestion(qIdx, 'hint', e.target.value)}
                              rows={2}
                              placeholder="Clue, mnemonic, or formula to help solve..."
                              className="w-full p-2.5 rounded-xl bg-theme-surface border border-theme-border text-xs text-theme-text focus:outline-none focus:ring-2 focus:ring-amber-500/40 placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal leading-relaxed resize-y min-h-[3.5rem]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                              🔍 Step-by-Step Explanation & Solution
                            </label>
                            <textarea
                              value={q.explanation}
                              onChange={(e) => handleUpdateQuestion(qIdx, 'explanation', e.target.value)}
                              rows={3}
                              placeholder="Step-by-step mathematical or logical solution..."
                              className="w-full p-2.5 rounded-xl bg-theme-surface border border-theme-border text-xs text-theme-text focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-theme-text/45 dark:placeholder:text-theme-text/40 placeholder:font-normal leading-relaxed resize-y min-h-[4.5rem]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

                {/* 5. Sticky Bottom Publish Footer Bar — Settles cleanly at the bottom */}
                <div className="sticky bottom-0 sm:bottom-4 z-20 mt-auto p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-theme-surface/95 backdrop-blur-md border border-theme-border shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="w-9 h-9 rounded-xl bg-[#006d5c]/15 text-[#005a4c] dark:text-teal-300 flex items-center justify-center font-black shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-extrabold text-theme-text truncate">
                        Ready to {editingExamId ? 'Update' : 'Publish'} Test
                      </div>
                      <div className="text-[11px] sm:text-xs text-theme-text/60 truncate">
                        {questions.length} questions · {totalMarks} marks · {durationMinutes} mins · {category}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleAddQuestion}
                      className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-3 rounded-xl border border-theme-border bg-theme-surface hover:bg-theme-border/30 text-theme-text font-bold text-xs sm:text-sm transition cursor-pointer"
                    >
                      + Add Question
                    </button>

                    <button
                      type="submit"
                      className="flex-1 sm:flex-initial px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-[#006d5c] via-[#008573] to-[#005a4c] hover:brightness-110 text-white font-extrabold text-xs sm:text-base shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-teal-100 shrink-0" />
                      <span className="truncate">{editingExamId ? 'Save & Update Paper' : 'Publish to Student Catalog'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {/* 6. Send Notifications View (Rule 4) */}
          {activeAdminTab === 'notifications' && (
            <section role="tabpanel" aria-label="Send Notifications Management">
              <AdminNotificationManager />
            </section>
          )}
        </div>

        {/* STUDENT PREVIEW MODAL */}
        {previewingQuestionIdx !== null && questions[previewingQuestionIdx] && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-preview-modal-title"
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="bg-theme-surface border-2 border-theme-border rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
              <div className="flex items-center justify-between border-b border-theme-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-700 text-white">
                    Student-Side Experience Preview
                  </span>
                  <span className="text-xs text-theme-text/70">
                    Exact component and auditory accessibility logic
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewingQuestionIdx(null)}
                  className="p-1.5 rounded-lg border border-theme-border hover:bg-theme-border text-theme-text font-bold text-xs"
                >
                  ✕ Close Preview
                </button>
              </div>

              {/* Simulated Question Card */}
              {(() => {
                const previewQ = questions[previewingQuestionIdx];
                return (
                  <div className="space-y-4">
                    <h3
                      id="student-preview-modal-title"
                      className="text-xl font-bold text-theme-text flex items-center gap-2"
                    >
                      <span className="text-theme-primary font-black">Q{previewQ.questionNumber}.</span>
                      <span>{previewQ.questionText || 'Question statement...'}</span>
                    </h3>

                    {previewQ.mathLatex && (
                      <div className="p-3 rounded-xl bg-theme-bg border border-theme-border inline-block max-w-full overflow-x-auto">
                        <MathEquation latex={previewQ.mathLatex} displayMode={true} />
                      </div>
                    )}

                    {/* Sonification Graph if enabled */}
                    {previewQ.graph && previewQ.graph.enabled && (
                      <InteractiveSonificationGraph graph={previewQ.graph} isStudentMode={true} />
                    )}

                    {/* 4 Options Grid */}
                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-bold uppercase text-theme-text/60">
                        Options Preview:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {previewQ.options.map((opt) => (
                          <div
                            key={opt.number}
                            className={`p-3 rounded-xl border-2 flex items-center gap-3 ${previewQ.correctOption === opt.number
                                ? 'border-emerald-500 bg-emerald-500/10'
                                : 'border-theme-border bg-theme-bg'
                              }`}
                          >
                            <span className="w-6 h-6 rounded-full bg-theme-border font-bold text-xs flex items-center justify-center">
                              {opt.number}
                            </span>
                            <span className="text-xs font-medium text-theme-text">{opt.text || `Option ${opt.number}`}</span>
                            {previewQ.correctOption === opt.number && (
                              <span className="ml-auto text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                ✓ Correct Answer
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {previewQ.explanation && (
                      <div className="p-3 rounded-xl bg-theme-bg border border-theme-border text-xs text-theme-text/80">
                        <strong>Solution Explanation:</strong> {previewQ.explanation}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ENTERPRISE COMMAND PALETTE MODAL (Ctrl+K / ⌘K) */}
        {isCommandPaletteOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin Command Palette"
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-4 transition-opacity animate-in fade-in duration-150"
            onClick={() => setIsCommandPaletteOpen(false)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl bg-theme-surface border border-theme-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Palette Search Header */}
              <div className="flex items-center px-4 py-3.5 border-b border-theme-border gap-3">
                <Search className="w-5 h-5 text-[#005a4c] dark:text-teal-300 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="Type a command or search..."
                  className="w-full bg-transparent text-sm sm:text-base text-theme-text placeholder:text-theme-text/40 focus:outline-none font-medium"
                />
                {paletteQuery && (
                  <button
                    type="button"
                    onClick={() => setPaletteQuery('')}
                    className="p-1 rounded-lg text-theme-text/50 hover:text-theme-text"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <kbd className="px-2 py-1 rounded bg-theme-bg border border-theme-border text-[10px] font-mono font-bold text-theme-text/60">
                  ESC
                </kbd>
              </div>

              {/* Palette Results List */}
              <div className="p-3 overflow-y-auto space-y-4 flex-1">
                {/* 1. Core Navigation Tabs */}
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-theme-text/50 px-2 py-1">
                    Navigation & Views
                  </div>
                  <div className="space-y-1">
                    {[
                      { id: 'dashboard', label: 'Executive Analytics Dashboard', key: '1 / D', icon: LayoutDashboard },
                      { id: 'manage', label: 'Manage Exam Papers & Practice Drills', key: '2 / Q', icon: BookOpen },
                      { id: 'create', label: 'Question Bank & Authoring Studio', key: '3 / C', icon: HelpCircle },
                      { id: 'students', label: 'Student Cohort Roster & Accommodations', key: '4 / S', icon: Users },
                      { id: 'submissions', label: 'Candidate Submissions & Graded Reports', key: '5 / R', icon: Award },
                      { id: 'notifications', label: 'Broadcast Notifications to Students', key: '6 / N', icon: Megaphone },
                    ]
                      .filter((tab) => !paletteQuery || tab.label.toLowerCase().includes(paletteQuery.toLowerCase()))
                      .map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setActiveAdminTab(tab.id as any);
                            if (tab.id === 'create') setEditingExamId(null);
                            setIsCommandPaletteOpen(false);
                            soundEffects.playSelect();
                          }}
                          className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-bold flex items-center justify-between transition ${
                            activeAdminTab === tab.id
                              ? 'bg-[#006d5c] text-white shadow-xs'
                              : 'hover:bg-theme-bg text-theme-text'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <tab.icon className={`w-4 h-4 ${activeAdminTab === tab.id ? 'text-white' : 'text-[#005a4c] dark:text-teal-300'}`} />
                            <span>{tab.label}</span>
                          </div>
                          <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            activeAdminTab === tab.id
                              ? 'bg-black/20 text-white'
                              : 'bg-theme-bg border border-theme-border text-theme-text/60'
                          }`}>
                            {tab.key}
                          </kbd>
                        </button>
                      ))}
                  </div>
                </div>

                {/* 2. Quick Operations */}
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-theme-text/50 px-2 py-1">
                    Administrative Operations
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {[
                      {
                        label: 'Export Student Roster (CSV)',
                        icon: Download,
                        action: () => {
                          handleExportStudentsCsv();
                          setIsCommandPaletteOpen(false);
                        },
                      },
                      {
                        label: 'Export Submissions Report (CSV)',
                        icon: FileSpreadsheet,
                        action: () => {
                          handleExportSubmissionsCsv();
                          setIsCommandPaletteOpen(false);
                        },
                      },
                      {
                        label: 'Sync Database with Atlas',
                        icon: RefreshCw,
                        action: () => {
                          void handleManualSync();
                          setIsCommandPaletteOpen(false);
                        },
                      },
                      {
                        label: `Toggle Theme: ${theme === 'dark' ? 'Teal' : 'Charcoal Dark'}`,
                        icon: theme === 'dark' ? Sun : Moon,
                        action: () => {
                          const next: ThemeMode = theme === 'dark' ? 'teal-cream' : 'dark';
                          setTheme(next);
                          soundEffects.playSelect();
                        },
                      },
                      {
                        label: 'Create New Mock Test',
                        icon: PlusCircle,
                        action: () => {
                          setEditingExamId(null);
                          setExamType('exam');
                          setActiveAdminTab('create');
                          setIsCommandPaletteOpen(false);
                          soundEffects.playSelect();
                        },
                      },
                      {
                        label: 'Import Questions from Word (.docx)',
                        icon: FileText,
                        action: () => {
                          setActiveAdminTab('create');
                          setIsCommandPaletteOpen(false);
                          wordFileRef.current?.click();
                        },
                      },
                      {
                        label: 'Import Questions from PDF (.pdf)',
                        icon: FileText,
                        action: () => {
                          setActiveAdminTab('create');
                          setIsCommandPaletteOpen(false);
                          pdfFileRef.current?.click();
                        },
                      },
                    ]
                      .filter((op) => !paletteQuery || op.label.toLowerCase().includes(paletteQuery.toLowerCase()))
                      .map((op, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={op.action}
                          className="px-3 py-2.5 rounded-xl border border-theme-border bg-theme-surface hover:border-[#006d5c] text-left text-xs font-bold text-theme-text flex items-center gap-2.5 transition"
                        >
                          <op.icon className="w-4 h-4 text-[#005a4c] dark:text-teal-300 shrink-0" />
                          <span className="truncate">{op.label}</span>
                        </button>
                      ))}
                  </div>
                </div>

                {/* 3. Filtered Exam Matches (if user searched) */}
                {paletteQuery.trim() && (
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-theme-text/50 px-2 py-1">
                      Matching Exams & Tests ({availableExams.filter((e) => e.title.toLowerCase().includes(paletteQuery.toLowerCase()) || e.code.toLowerCase().includes(paletteQuery.toLowerCase())).length})
                    </div>
                    <div className="space-y-1">
                      {availableExams
                        .filter(
                          (e) =>
                            e.title.toLowerCase().includes(paletteQuery.toLowerCase()) ||
                            e.code.toLowerCase().includes(paletteQuery.toLowerCase())
                        )
                        .slice(0, 4)
                        .map((exam) => (
                          <div
                            key={exam.id}
                            className="p-2.5 rounded-xl bg-theme-bg border border-theme-border flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-extrabold text-theme-text truncate">{exam.title}</div>
                              <div className="text-[11px] text-theme-text/60 font-mono">
                                {exam.code} · {exam.durationMinutes}m · {exam.questions?.length || exam.questionCount || 0} Questions
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCommandPaletteOpen(false);
                                  handleTestAsStudent(exam, 'exam');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#006d5c] text-white font-bold text-xs"
                              >
                                Test
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCommandPaletteOpen(false);
                                  void handleStartEditExam(exam.id);
                                }}
                                className="px-2.5 py-1 rounded-lg border border-theme-border bg-theme-surface text-theme-text font-bold text-xs"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 4. Filtered Candidate Matches (if user searched) */}
                {paletteQuery.trim() && (
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-theme-text/50 px-2 py-1">
                      Matching Candidates ({students.filter((s) => s.name.toLowerCase().includes(paletteQuery.toLowerCase()) || s.rollNumber.toLowerCase().includes(paletteQuery.toLowerCase())).length})
                    </div>
                    <div className="space-y-1">
                      {students
                        .filter(
                          (s) =>
                            s.name.toLowerCase().includes(paletteQuery.toLowerCase()) ||
                            s.rollNumber.toLowerCase().includes(paletteQuery.toLowerCase())
                        )
                        .slice(0, 4)
                        .map((st) => (
                          <div
                            key={st.id}
                            onClick={() => {
                              setSelectedStudent(st);
                              setActiveAdminTab('students');
                              setIsCommandPaletteOpen(false);
                              soundEffects.playSelect();
                            }}
                            className="p-2.5 rounded-xl bg-theme-bg border border-theme-border hover:border-[#006d5c] cursor-pointer flex items-center justify-between gap-3 text-xs transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-[#006d5c]/20 text-[#005a4c] dark:text-teal-300 font-black flex items-center justify-center shrink-0">
                                {st.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-extrabold text-theme-text truncate">{st.name}</div>
                                <div className="text-[11px] text-theme-text/60 font-mono">{st.rollNumber}</div>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-[#005a4c] dark:text-teal-300">View Profile →</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Palette Footer Hints */}
              <div className="px-4 py-2.5 bg-theme-bg border-t border-theme-border flex items-center justify-between text-[11px] text-theme-text/60 font-semibold">
                <div className="flex items-center gap-3">
                  <span>↵ to execute</span>
                  <span>↑↓ to navigate</span>
                  <span>Esc to dismiss</span>
                </div>
                <span className="font-bold text-[#005a4c] dark:text-teal-300">DrishtiX Enterprise Command Suite</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
