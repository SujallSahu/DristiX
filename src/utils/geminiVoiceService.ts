import { getAssistantContext } from './assistantContext';
import { useExamStore } from '../store/useExamStore';
import { useAnnouncerStore } from '../store/useAnnouncerStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import type { TextScale } from '../store/usePreferencesStore';
import { soundEffects } from './soundEffects';
import { buildFullQuestionSpeech } from './voiceCommandProcessor';
import type { CommandProcessResult } from './voiceCommandProcessor';
import { describeOptionSelection, describeClearSelection } from './optionSpeech';
import { matchExamFromQuery } from './examMatcher';
import { isPracticeTabNavigation } from './practiceTabNavigation';
import { getDataSource } from '../services/dataSource';
import { isHindiPreferred, voiceRecognition } from './voiceRecognition';
import { useNotificationStore } from '../store/useNotificationStore';
import type { Exam } from '../../shared/types';

const API_KEY_STORAGE = 'dristix_gemini_api_key';
const GROQ_API_KEY_STORAGE = 'dristix_groq_api_key';

/**
 * NO API KEYS LIVE IN THE BROWSER BUNDLE ANY MORE.
 *
 * These two constants used to read `import.meta.env.VITE_*`, which Vite inlines
 * into the JavaScript at build time — readable by anyone who opened DevTools,
 * and burnable from their own machine. Both are now empty by definition; the
 * keys live only in `server/.env` and the browser talks to `/api/ai/*`.
 *
 * They remain exported because offline mode has no server, and a developer may
 * still opt into a BYO-key path by typing a key into the orb, which is stored in
 * localStorage and never shipped.
 */
export const DEFAULT_GEMINI_API_KEY = '';
export const DEFAULT_GROQ_API_KEY = '';

export interface GeminiParsedCommand {
  action:
    | 'SELECT_OPTION'
    | 'CLEAR_OPTION'
    | 'NEXT_QUESTION'
    | 'PREVIOUS_QUESTION'
    | 'JUMP_QUESTION'
    | 'MARK_REVIEW'
    | 'READ_QUESTION'
    | 'CHECK_TIMER'
    | 'QUESTION_PALETTE'
    | 'SUBMIT_EXAM'
    | 'FINAL_SUBMIT'
    | 'CONTINUE_EXAM'
    | 'CANCEL_SUBMIT'
    | 'START_EXAM'
    | 'HINT'
    | 'EXPLANATION'
    | 'ANALYTICS'
    | 'LIST_EXAMS'
    | 'EXAM_INTEGRITY_REFUSAL'
    | 'GENERAL_QUERY';
  param?: number | string | null;
  transcript: string;
  reply: string;
}

class GeminiVoiceService {
  private apiKey: string = DEFAULT_GEMINI_API_KEY;
  private groqApiKey: string = DEFAULT_GROQ_API_KEY;
  private discoveredModels: string[] = [];
  private groqActiveModels: string[] = [];
  private lastApiError: string = '';
  private activeAbortController: AbortController | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // A BYO key is opt-in and lives only in this browser's localStorage.
      // In api mode the server holds the real key and the proxy is used instead.
      const stored = localStorage.getItem(API_KEY_STORAGE);
      this.apiKey = (stored || DEFAULT_GEMINI_API_KEY)
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim();

      const storedGroq = localStorage.getItem(GROQ_API_KEY_STORAGE);
      this.groqApiKey = (storedGroq || DEFAULT_GROQ_API_KEY)
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim();

      if (this.hasApiKey()) {
        this.validateApiKey();
      }
      if (this.groqApiKey) {
        this.discoverGroqModels();
      }
    }
  }

  /**
   * True when calls should go through the server proxy rather than directly.
   * The proxy is what keeps the provider key off the client.
   */
  private get usesProxy(): boolean {
    return !this.apiKey;
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public getGroqApiKey(): string {
    return this.groqApiKey;
  }

  public getLastApiError(): string {
    return this.lastApiError;
  }

  public setApiKey(key: string) {
    this.apiKey = (key || '').trim().replace(/^["']|["']$/g, '').trim();
    if (typeof window !== 'undefined') {
      if (this.apiKey) {
        localStorage.setItem(API_KEY_STORAGE, this.apiKey);
        this.validateApiKey();
      } else {
        localStorage.removeItem(API_KEY_STORAGE);
        this.discoveredModels = [];
        this.lastApiError = '';
      }
    }
  }

  public setGroqApiKey(key: string) {
    this.groqApiKey = (key || DEFAULT_GROQ_API_KEY).trim().replace(/^["']|["']$/g, '').trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem(GROQ_API_KEY_STORAGE, this.groqApiKey);
    }
  }

  /**
   * Whether the conversational path can be used.
   *
   * The provider keys now live on the server and requests go through the
   * /api/ai proxy, so this must no longer mean "a key is present in the
   * browser" — that check is permanently false and silently disabled the entire
   * assistant. True whenever either the proxy or a developer-supplied key can
   * serve the request.
   */
  public hasApiKey(): boolean {
    return this.usesProxy || this.getApiKey().length > 10 || this.getGroqApiKey().length > 10;
  }

  /**
   * True only when a key was supplied directly in the browser. Gates the audio
   * upload path, which cannot work through the proxy because it needs the key
   * in the browser to sign the request.
   */
  public hasValidGeminiKey(): boolean {
    const cleanGemini = this.apiKey.trim().replace(/^["']|["']$/g, '').trim();
    return cleanGemini.startsWith('AIzaSy') && cleanGemini.length > 25;
  }

  /**
   * Validate key against Google AI Studio / Generative Language API and discover supported models
   */
  public async validateApiKey(keyToTest?: string): Promise<{ ok: boolean; message: string; models?: string[] }> {
    const key = (keyToTest !== undefined ? keyToTest : this.apiKey).trim().replace(/^["']|["']$/g, '').trim();
    if (!key || key.length < 10) {
      return { ok: false, message: 'API key is too short or empty.' };
    }

    try {
      const endpoints = [
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const models: string[] = (data?.models || [])
              .filter((m: any) => {
                const name = (m.name || '').toLowerCase();
                const methods = m.supportedGenerationMethods || [];
                if (!methods.includes('generateContent')) return false;
                // Only allow gemini-flash and gemini-pro models (NOT gemma — gemma doesn't support audio)
                // Also exclude tts, preview, embedding, imagen models
                if (
                  name.includes('gemma') ||
                  name.includes('tts') ||
                  name.includes('preview') ||
                  name.includes('embedding') ||
                  name.includes('imagen') ||
                  name.includes('aqa')
                ) {
                  return false;
                }
                // Must be a gemini model
                if (!name.includes('gemini')) return false;
                return true;
              })
              .map((m: any) => (m.name || '').replace(/^models\//, ''));

            this.discoveredModels = models;
            this.lastApiError = '';
            console.log('✅ Gemini API Key verified! Supported models:', models);
            return {
              ok: true,
              message: `Connected successfully! (Using: gemini-1.5-flash)`,
              models,
            };
          } else {
            const errText = await response.text();
            let parsedMsg = `Status ${response.status}`;
            try {
              const errObj = JSON.parse(errText);
              if (errObj.error?.message) {
                parsedMsg = errObj.error.message;
              }
            } catch {}
            this.lastApiError = parsedMsg;
            console.warn(`[Gemini API Check] Endpoint ${endpoint} returned ${response.status}:`, parsedMsg);
          }
        } catch (innerErr: any) {
          console.warn('[Gemini API Check] Connection attempt failed:', innerErr);
        }
      }

      return {
        ok: false,
        message: this.lastApiError || 'Failed to authenticate with Google Generative Language API.',
      };
    } catch (err: any) {
      this.lastApiError = err?.message || 'Network error connecting to Google API';
      return { ok: false, message: this.lastApiError };
    }
  }

  /**
   * Parses a model's JSON reply.
   *
   * A bare JSON.parse is not enough: even when asked for JSON only, models
   * sometimes wrap the object in a ```json fence or prefix it with a sentence,
   * and the command was then silently dropped. This unwraps those cases, and
   * falls back to the first balanced {...} block if the text is still not pure
   * JSON. Shared by every path that reads a model reply so a malformed reply
   * fails the same way everywhere.
   */
  private parseCommandJson(content: string): GeminiParsedCommand | null {
    if (typeof content !== 'string' || !content.trim()) return null;

    const candidates: string[] = [];
    const raw = content.trim();

    // Strip a markdown code fence: ```json ... ``` or ``` ... ```
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]?.trim()) candidates.push(fence[1].trim());

    candidates.push(raw);

    // Any balanced object, for replies with stray prose around it.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1));

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as GeminiParsedCommand;
        if (parsed && typeof parsed.action === 'string') return parsed;
      } catch {
        // try the next candidate
      }
    }

    console.warn('[VoiceService] could not parse model reply as a command:', raw.slice(0, 160));
    return null;
  }

  /**
   * Sends the Gemini request through our own backend instead of Google
   * directly. This is the path that keeps the provider key on the server: the
   * browser authenticates to us with a normal access token and never sees the
   * upstream key at all.
   */
  private async executeViaProxy(payload: any): Promise<any> {
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
    }
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const timeoutId = setTimeout(() => {
      try {
        abortController.abort();
      } catch {}
    }, 6000);

    try {
      const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
      if (payload?.systemInstruction?.parts?.[0]?.text) {
        messages.push({ role: 'system', content: payload.systemInstruction.parts[0].text });
      }
      for (const c of payload?.contents ?? []) {
        const text = (c?.parts ?? []).map((p: any) => p?.text ?? '').join('').trim();
        if (text) messages.push({ role: c?.role === 'model' ? 'assistant' : 'user', content: text });
      }
      if (messages.length === 0) return null;

      const data = await getDataSource().ai.chat({
        provider: 'gemini',
        messages,
        model: payload?.model,
        temperature: payload?.generationConfig?.temperature,
        maxTokens: payload?.generationConfig?.maxOutputTokens,
      });

      if (abortController.signal.aborted) return null;

      // Shaped like a real Gemini response so every existing parsing path
      // downstream keeps working without being aware of the proxy.
      return {
        candidates: [{ content: { parts: [{ text: data.reply }] } }],
      };
    } catch (err: any) {
      this.lastApiError = err?.message || 'The AI assistant proxy is unavailable.';
      console.warn('[GeminiProxy] request failed:', err?.message ?? err);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fast, reliable multi-model caller.
   * Immediately aborts any previous pending request and enforces a strict 4.2s timeout
   * so requests never hang, accumulate in background queues, or fire late.
   */
  private async executeGenerateContent(payload: any): Promise<any> {
    const cleanKey = this.apiKey.trim().replace(/^["']|["']$/g, '').trim();

    // Proxy path: no key on the client, the server holds it. Extracted here so
    // the rest of the multi-model logic below is unchanged.
    if (this.usesProxy) return this.executeViaProxy(payload);

    if (!cleanKey) return null;

    // 1. Immediately abort prior in-flight request so earlier spoken commands never linger
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
    }

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    // 2. High-speed models, newest first.
    //
    // The previous list (gemini-1.5-flash / 2.0-flash / 1.5-pro) has been fully
    // retired by Google and every one of them now returns 404. This path is
    // only taken when the developer supplies their own key; the normal route is
    // the server proxy, which resolves a working model at runtime.
    const FAST_MODELS = [
      'gemini-flash-lite-latest',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];
    const filteredDiscovered = this.discoveredModels.filter(
      (m) => m.includes('flash') && !m.includes('gemma') && !m.includes('tts') && !m.includes('image')
    );
    const modelsToTry = filteredDiscovered.length > 0 ? filteredDiscovered : FAST_MODELS;

    for (const model of modelsToTry) {
      if (abortController.signal.aborted) return null;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;

      const timeoutId = setTimeout(() => {
        try {
          abortController.abort();
        } catch {}
      }, 4200);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          this.lastApiError = '';
          return data;
        } else {
          const errBody = await response.text();
          let errMsg = `Status ${response.status}`;
          try {
            const errObj = JSON.parse(errBody);
            errMsg = errObj?.error?.message || errMsg;
          } catch {}
          this.lastApiError = errMsg;
          console.warn(`[Gemini API] ${model} error (${response.status}):`, errMsg);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          console.log('[Gemini API] In-flight request aborted/timed out to keep voice response real-time.');
          return null;
        }
        console.warn(`[Gemini API] Network failure on ${model}:`, err?.message || err);
      }
    }

    return null;
  }

  /**
   * Universal Structured System Prompt enforcing Language Matching and Strict Exam Integrity
   */
  private buildSystemPrompt(context: any, rawText: string): string {
    const userSpeaksHindi =
      context.voiceLanguageMode === 'hi-IN' ||
      context.isHindiMode ||
      voiceRecognition.isHindiMode() ||
      /[\u0900-\u097F]/.test(rawText) ||
      (context.voiceLanguageMode !== 'en-US' && isHindiPreferred(rawText));

    const languageRule = userSpeaksHindi
      ? `1. MANDATORY HINDI FOR ALL SPOKEN REPLIES AND ANNOUNCEMENTS (CRITICAL):
- The candidate has switched the system language to HINDI (हिन्दी) or spoke in Hindi.
- YOU MUST ALWAYS PRODUCE YOUR "reply" 100% IN NATURAL, ACCURATE, FLUENT, AND POLITE HINDI (DEVANAGARI SCRIPT, हिन्दी).
- NEVER output English sentences in the "reply" field (except essential official exam acronyms like SSC CGL, RRB NTPC, UPSC CSAT).
- Every confirmation, status explanation, question navigation announcement, and refusal must be entirely in Hindi!
- Examples of replies in proper Hindi:
  * "मॉक टेस्ट पेज पर वापस जा रहे हैं।"
  * "दूसरा विकल्प चुन लिया गया है।"
  * "अगले प्रश्न पर जा रहे हैं।"
  * "आप अभी मॉक टेस्ट श्रृंखला पेज पर हैं।"
  * "इस पेज पर कुल 4 मॉक टेस्ट उपलब्ध हैं।"
  * "परीक्षा के दौरान उत्तर बताना या प्रश्न हल करना वर्जित है।"
  * "परीक्षा सबमिट किए बिना आप बाहर नहीं जा सकते। मैंने सबमिट विंडो खोल दी है।"
  * "आपका स्कोर 20 में से 18 रहा।"`
      : `1. MANDATORY ENGLISH FOR ALL SPOKEN REPLIES AND ANNOUNCEMENTS:
- Regardless of whether the user speaks or commands in English, Hindi, or Hinglish:
  * Understand the user's command or intent fully (even if spoken in Hindi or Hinglish, e.g. "dusra option chuno", "sawal padho", "agla sawal", "test shuru karo", "wapas jao").
  * ALWAYS produce your "reply" 100% IN NATURAL, ACCURATE, AND POLITE ENGLISH.
  * NEVER output Hindi or Hinglish text in the "reply" field. All confirmations, questions, and announcements must be in clear English.`;

    return `You are DristiX AI Voice Assistant for visually impaired and competitive exam candidates in India.
Current System State:
- Active Screen: "${context.activeView}"
- Is Exam Submitted: ${context.isSubmitted ? 'YES (Exam is completed and submitted! Candidate is viewing Diagnostic Report)' : 'NO'}
- Is Submit Confirmation Modal Open: ${context.isSubmitModalOpen ? 'YES (Submit confirmation dialog is currently open! The candidate can say "Yes, Final Submit" to finish or "Continue to Exam" to resume)' : 'NO'}
- Portal Tab: "${context.portalTab === 'practice' ? 'Practice Arena (Hints & Solutions)' : 'Mock Examinations (Timed Tests)'}"
- Screen Details: ${
  context.activeView === 'report'
    ? `The candidate has ALREADY COMPLETED and SUBMITTED the examination! They are currently viewing the "Diagnostic Report & Performance Breakdown" for "${context.diagnosticReport?.examTitle || context.currentExam?.title}". Their score is ${context.diagnosticReport?.totalScore || 0}/${context.diagnosticReport?.maxScore || 20} points (${context.diagnosticReport?.scorePercentage || 0}%). DO NOT claim an exam is currently running or that they are on Question 1 or Question 2! They can read summary, retake the test, or return to mock test catalog.`
    : context.activeView === 'catalog'
    ? `User is currently on the "${context.portalTab === 'practice' ? 'Interactive Practice Arena' : 'Examination & Mock Test Series'}" catalog dashboard. There are ${context.availableExams.length} Mock Examinations and ${context.availableDrills.length} Practice Drills available to attempt.`
    : context.activeView === 'exam'
    ? `User is currently taking live ${context.currentExam?.isPractice ? 'Practice Drill' : 'Mock Examination'} "${context.currentExam?.title || 'Mock Test'}" on Question ${context.currentQuestion?.number || 1} of ${context.currentExam?.totalQuestions || 10}.`
    : `User is viewing their "My Performance & Score Analytics" dashboard. Real Live Metrics on Screen:
  • Candidate: ${context.studentName} (${context.studentRoll})
  • Tests Completed: ${context.analytics?.totalTests ?? context.totalSubmissions} total (${context.analytics?.timedExamsCount ?? 0} Timed Exams, ${context.analytics?.drillsCount ?? 0} Practice Drills)
  • Best Score: ${context.analytics?.bestScorePercentage ?? context.bestScorePercentage}% (${context.analytics?.bestScoreMarks ?? ''} points) in "${context.analytics?.bestScoreTitle ?? context.bestScoreTitle}"
  • Average Accuracy: ${context.analytics?.averageAccuracy ?? context.averageAccuracy}%
  • Questions Solved: ${context.analytics?.questionsSolved ?? 0} total (${context.analytics?.correctCount ?? 0} Correct, ${context.analytics?.wrongCount ?? 0} Wrong)
  • Recent Examination History:
${context.analytics?.recentSubmissions?.map((s: any, idx: number) => `    ${idx + 1}. ${s.examTitle} (${s.examCode}) - ${s.examType === 'exam' ? 'Timed Exam' : 'Practice Drill'}, Date: ${s.date}, Score: ${s.score}/${s.maxScore} pts, Accuracy: ${s.percentage}%, Answers: ${s.correctCount} Correct, ${s.incorrectCount} Incorrect, ${s.unattemptedCount} Skipped`).join('\n') || '    None'}
  If candidate asks about their score, summary, performance, questions solved, accuracy, or history, quote these exact real figures!`
}
- Current Exam: ${context.currentExam ? `"${context.currentExam.title}" (${context.currentExam.isPractice ? 'Practice Drill' : 'Live Mock Examination'})` : 'None (On Exam Catalog Screen)'}
- Current Question: ${context.activeView === 'exam' && context.currentQuestion ? `Q${context.currentQuestion.number}: "${context.currentQuestion.text}"` : 'None (Not in live exam)'}
- Available Options: ${context.activeView === 'exam' && context.currentQuestion ? JSON.stringify(context.currentQuestion.options) : '[]'}
- Current Selected Option: ${context.currentQuestion?.selectedOption ?? 'None'}
- Time Remaining: "${context.timeRemainingFormatted}"
- Available Exams: ${JSON.stringify(context.availableExams.map((e: any) => ({ id: e.id, title: e.title, code: e.code })))}

User Spoken Command: "${rawText}"

CRITICAL SYSTEM RULES (STRICT COMPLIANCE REQUIRED):

${languageRule}

2. STRICT EXAM INTEGRITY RULE (NO SOLVING, NO ANSWER DISCLOSURE):
- When the candidate is taking an exam/mock test (Active Screen: "exam"):
  * If the user asks to SOLVE the question, REVEAL THE CORRECT ANSWER, EXPLAIN THE SOLUTION, GIVE HINTS, OR ASK WHICH OPTION IS RIGHT (e.g., "solve this question", "answer batao", "explain this question", "sahi option kaun sa hai", "what is the answer", "is question ko solve karo", "help me solve"):
    -> YOU MUST NEVER solve the question or reveal any answers or hints!
    -> Set "action": "EXAM_INTEGRITY_REFUSAL".
    -> Reply: ${userSpeaksHindi ? '"परीक्षा के दौरान उत्तर बताना या सवाल हल करना वर्जित है। आप मुझसे प्रश्न पढ़ने, विकल्प चुनने, अगला सवाल देखने या शेष समय पूछने के लिए कह सकते हैं।"' : '"Exam integrity mode is active. I cannot solve questions or provide answers during the live test. You can ask me to read the question, navigate, select an option, or check the time."'}

3. STRICT NO-EXIT BEFORE SUBMIT RULE:
- ONLY when taking an ACTIVE unsubmitted exam (Active Screen: "exam" AND Is Exam Submitted: "NO"):
  * If the candidate asks to go back, return to catalog, exit, close the exam, or start another exam before submitting:
    -> YOU MUST NOT exit the test or start another exam!
    -> Set "action": "SUBMIT_EXAM".
    -> Reply: ${userSpeaksHindi ? '"परीक्षा सबमिट किए बिना आप बाहर नहीं जा सकते। मैंने सबमिट पुष्टि विंडो खोल दी है। कृपया पहले अपनी परीक्षा सबमिट करें।"' : '"You cannot leave the exam before submitting it. I have opened the submit confirmation window. Please submit your exam first."'}
- WHEN ON REPORT SCREEN (Active Screen: "report" OR Is Exam Submitted: "YES"):
  * If the candidate asks to go to mock test page, catalog, home, or choose another exam (e.g. "go on mock test page", "गो ऑन मॉक टेस्ट पेज", "mock test page par jao", "choose another exam", "wapas jao"):
    -> SET "action": "RETURN_CATALOG". They are completely allowed to return to the catalog!

4. SUPPORTED EXAM ACTIONS:
- "WHERE_AM_I": User asks what page, screen, or test they are currently on (e.g. "main kis page par hoon", "which page is this", "where am I").
  * If on Report screen: State clearly that the exam is submitted, and they are viewing the Diagnostic Report & Performance Breakdown for "${context.diagnosticReport?.examTitle || context.currentExam?.title}".
  * If candidate is taking an active exam: State that they are on the live Mock Examination page for "${context.currentExam?.title || 'Mock Test'}" on Question ${context.currentQuestion?.number || 1}.
  * If on catalog: State clearly that they are on the "${context.portalTab === 'practice' ? 'Practice Arena' : 'Examination & Mock Test Series'}" catalog dashboard.
- "RETURN_CATALOG": Return to catalog or mock tests list (e.g. "go to mock test page", "गो ऑन मॉक टेस्ट पेज", "mock test page par jao", "choose another exam", "wapas jao", "catalog").
- "PRACTICE_TAB": Switch to the Practice Arena tab WITHOUT starting any drill (e.g. "go on the practice tab", "practice page par jao", "practical page", "प्रैक्टिस टैब पर जाओ", "अभ्यास पेज"). Use this whenever the user only asks to GO TO, SHOW or SEE the practice tab/page and wants to hear which practice drills are listed — NEVER use START_EXAM for such a request. Only when the user names a specific drill and asks to open/start it may you use START_EXAM.
- "READ_REPORT_SUMMARY": Read performance summary on report screen (e.g. "read summary", "summary padho", "score batao").
- "RETAKE_EXAM": Retake the test (e.g. "retake test", "dobara test do").
- "START_EXAM": Open or start a specific examination. In the "param" field, provide the exact matching exam id from Available Exams (e.g. "upsc-csat-paper2" for UPSC / Civil Services, "rrb-ntpc-general" for Railway / RRB NTPC, "ibps-po-quant-speed" for Banking / IBPS PO, or "ssc-cgl-tier1-full" for SSC CGL). Only use it when the user explicitly asks to start/open a named test or drill — for "go on the practice tab" use "PRACTICE_TAB" instead.
- "SELECT_OPTION": Select option (param: 1, 2, 3, or 4)
- "CLEAR_OPTION": Deselect option
- "NEXT_QUESTION": Next question
- "PREVIOUS_QUESTION": Previous question
- "JUMP_QUESTION": Jump to question (param: number)
- "MARK_REVIEW": Mark for review
- "READ_QUESTION": Read current question and options
- "CHECK_TIMER": Read remaining time
- "QUESTION_PALETTE": User asks for question palette, how many questions answered/unanswered/marked/left, or progress status (e.g. "question status", "palette batao", "kitne question bache hain", "palette kholo", "open question palette", "kitne sawal ho gaye")
- "SUBMIT_EXAM": Open submit modal during live exam
- "FINAL_SUBMIT": Finalize and confirm exam submission (e.g. "yes final submit", "final submit", "confirm submit", "submit final", "yes submit")
- "CONTINUE_EXAM": Resume active exam and close submit confirmation window (e.g. "continue to exam", "resume exam", "cancel submit", "return to exam")
- "CANCEL_SUBMIT": Cancel submission and return to the exam when user says "cancel", "return to exam", "back", "wapas", or "no".
- "ANALYTICS": View analytics
- "LIST_EXAMS": List available exams or tests on this page (e.g. "which tests are available", "is page par kon kon se test available hai", "kaun kaun se test hai", "available exams", "list tests", "tests ke naam batao", "kon se test hai", "is page par kya test hai")
- "LIST_THEMES": Candidate asks which themes are available or asks to list/tell the names of all themes (e.g. "which themes are available", "themes kaun kaun se hain", "list themes", "theme ke naam batao", "sare theme ka name batao", "konsi themes hain").
- "SELECT_THEME": Candidate asks to select, switch, apply, or set a theme (e.g. "select high contrast theme", "high contrast theme", "dark theme lagao", "teal cream theme", "liquid glass theme"). In "param", provide: "high-contrast", "dark", "teal-cream", or "liquid-glass".
- "SET_FONT_SIZE": Candidate asks to increase, decrease, or set font size/scaling (e.g. "font size badhao", "font 150%", "text bada karo", "font chhota karo"). In "param", provide: 100, 125, 150, 175, or 200.
- "OPEN_SETTINGS": Open Accessibility Preferences and Settings dialog (e.g. "open accessibility preference", "open settings", "accessibility preferences", "settings", "सेटिंग्स खोलो", "एक्सेसिबिलिटी खोलो"). Use this whenever the candidate asks for accessibility settings or preferences. NEVER use START_EXAM for opening settings!
- "CLOSE_SETTINGS": Close Accessibility Preferences modal (e.g. "close settings", "settings band karo", "close accessibility", "एक्सेसिबिलिटी बंद करो").
- "OPEN_SHORTCUTS": Open Keyboard Shortcuts Reference Guide (e.g. "open shortcuts", "keyboard shortcuts", "help guide", "shortcuts guide", "कीबोर्ड शॉर्टकट", "मदद").
- "CLOSE_SHORTCUTS": Close Keyboard Shortcuts Guide (e.g. "close shortcuts", "shortcuts band karo", "शॉर्टकट बंद करो").
- "NOTIFICATIONS": User asks for notifications, announcements, alerts, or messages (e.g. "open notifications", "read notifications", "check notifications", "any notifications", "show notifications", "what notifications do I have", "past notifications", "previous notifications", "नोटिफिकेशन पढ़ो", "नोटिफिकेशन खोलो", "सूचना").
- "CLOSE_NOTIFICATIONS": Close notification panel (e.g. "close notifications", "notification band karo", "नोटिफिकेशन बंद करो").
- "EXAM_INTEGRITY_REFUSAL": Triggered when user asks to solve or reveal answers in test
- "GENERAL_QUERY": General conversation or help

Return ONLY a valid JSON object matching this schema:
{
  "action": string,
  "param": number | string | null,
  "transcript": string,
  "reply": string
}`;
  }

  /**
   * Dynamically discover active models supported by the current Groq API key
   */
  public async discoverGroqModels(): Promise<string[]> {
    const key = (this.groqApiKey || DEFAULT_GROQ_API_KEY).trim();
    if (!key) return [];
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      if (response.ok) {
        const data = await response.json();
        const models: string[] = (data.data || [])
          .map((m: any) => m.id)
          .filter((id: string) => 
            !id.includes('whisper') && 
            !id.includes('guard') &&
            !id.includes('safeguard')
          );
        if (models.length > 0) {
          console.log('⚡ [Groq API] Discovered active models for key:', models);
          this.groqActiveModels = models;
          return models;
        }
      } else {
        const err = await response.text();
        console.warn('[Groq API] Models discovery response:', response.status, err);
      }
    } catch (err) {
      console.warn('[Groq API] Models discovery error:', err);
    }
    return [];
  }

  /**
   * Returns list of Groq models to try, using discovered active models first,
   * then falling back to comprehensive list of active Groq production models.
   */
  private async getGroqModels(): Promise<string[]> {
    if (this.groqActiveModels.length > 0) {
      return this.groqActiveModels;
    }
    const discovered = await this.discoverGroqModels();
    if (discovered.length > 0) {
      return discovered;
    }
    // The previous fallback list was entirely Llama/Mixtral/Gemma names that
    // Groq has since retired or restricted, so every request 404'd. The
    // server proxy resolves a reachable model at runtime; this list is only a
    // last resort for a developer-supplied key.
    return [
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-20b',
    ];
  }

  /**
   * Fallback high-speed inference via Groq Cloud with dynamic active model support
   */
  public async executeGroqChatCompletion(systemPrompt: string, userText: string): Promise<GeminiParsedCommand | null> {
    const key = (this.groqApiKey || DEFAULT_GROQ_API_KEY).trim();

    // Proxy path: the server holds the Groq key.
    if (this.usesProxy) {
      try {
        const data = await getDataSource().ai.chat({
          provider: 'groq',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
        });
        if (!data.reply) return null;
        return this.parseCommandJson(data.reply);
      } catch (err: any) {
        this.lastApiError = err?.message || 'The AI assistant proxy is unavailable.';
        console.warn('[GroqProxy] request failed:', err?.message ?? err);
        return null;
      }
    }

    if (!key) return null;

    const groqModels = await this.getGroqModels();

    for (const model of groqModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          try { controller.abort(); } catch {}
        }, 5000);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            const parsed = this.parseCommandJson(content);
            if (parsed) {
              console.log(`⚡ [Groq Fallback] Success via ${model}!`);
              // Put working model first so subsequent calls succeed in 1 request
              this.groqActiveModels = [model, ...this.groqActiveModels.filter((m) => m !== model)];
              return parsed;
            }
          }
        } else {
          const errText = await response.text();
          console.warn(`[Groq API] ${model} error (${response.status}):`, errText);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return null;
        console.warn(`[Groq API] Attempt on ${model} failed:`, err?.message || err);
      }
    }
    return null;
  }

  /**
   * Process a text command using Google Gemini AI, with seamless failover to Groq LLaMA
   */
  public async processTextWithGemini(rawText: string): Promise<CommandProcessResult | null> {
    if (!this.hasApiKey()) return null;

    const context = getAssistantContext();
    const systemPrompt = this.buildSystemPrompt(context, rawText);

    let parsed: GeminiParsedCommand | null = null;

    // 1. Primary path: Secure Backend AI Proxy (Groq LLaMA / Gemini on server)
    if (this.usesProxy) {
      try {
        const res = await getDataSource().ai.chat({
          provider: 'groq',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Candidate Spoken Command: "${rawText}"` },
          ],
          temperature: 0.1,
        });
        const replyText = res && (res.reply || (res as any).content);
        if (replyText) {
          parsed = this.parseCommandJson(replyText);
          if (parsed) console.log('🤖 Processed via Backend AI Proxy (Groq LLaMA)');
        }
      } catch (proxyErr) {
        console.warn('[Gemini Voice] Proxy Groq chat attempt failed, trying Gemini proxy...', proxyErr);
        try {
          const res = await getDataSource().ai.chat({
            provider: 'gemini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Candidate Spoken Command: "${rawText}"` },
            ],
            temperature: 0.1,
          });
          const geminiReply = res && (res.reply || (res as any).content);
          if (geminiReply) {
            parsed = this.parseCommandJson(geminiReply);
            if (parsed) console.log('🤖 Processed via Backend AI Proxy (Gemini)');
          }
        } catch (geminiProxyErr) {
          console.warn('[Gemini Voice] Both backend proxy LLM calls failed:', geminiProxyErr);
        }
      }
    }

    // 2. Direct client BYO keys (Google Gemini) fallback
    if (!parsed && this.apiKey && this.apiKey.length > 10) {
      try {
        const data = await this.executeGenerateContent({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nUser Spoken Command: "${rawText}"` }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (contentText) {
          parsed = this.parseCommandJson(contentText);
          if (parsed) console.log('🤖 Processed via Direct Google Gemini API');
        }
      } catch (err) {
        console.warn('[Gemini Voice] Gemini text attempt failed, shifting to Groq fallback...', err);
      }
    }

    // 3. Direct client BYO keys (Groq API) fallback
    if (!parsed && this.groqApiKey) {
      console.log('⚡ Shifting to Direct Groq API fallback (Llama 3.3)...');
      parsed = await this.executeGroqChatCompletion(systemPrompt, rawText);
    }

    if (parsed) {
      return this.executeParsedAction(parsed, rawText);
    }

    return null;
  }

  /**
   * Process raw audio recording using Gemini Multimodal for 100% accurate speech-to-intent
   */
  public async processAudioWithGemini(audioBlob: Blob): Promise<CommandProcessResult | null> {
    if (!this.hasValidGeminiKey()) return null;

    const base64Audio = await this.blobToBase64(audioBlob);
    const context = getAssistantContext();
    const systemPrompt = this.buildSystemPrompt(context, 'Spoken Audio Recording');

    // IMPORTANT: Audio/multimodal input ONLY works on gemini-1.5-flash and gemini-2.0-flash.
    // Gemma models (gemma-4-31b, gemma-4-26b, etc.) do NOT support audio — they return 400.
    // We override discoveredModels here to ensure audio requests only go to audio-capable models.
    const savedModels = this.discoveredModels;
    this.discoveredModels = ['gemini-1.5-flash', 'gemini-2.0-flash'];

    const data = await this.executeGenerateContent({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: (audioBlob.type || 'audio/webm').split(';')[0].trim() || 'audio/webm',
                data: base64Audio,
              },
            },
            { text: systemPrompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    // Restore original model list
    this.discoveredModels = savedModels;

    const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!contentText) return null;

    try {
      const parsed = this.parseCommandJson(contentText);
      if (!parsed) {
        console.warn('Failed to parse Gemini audio output as a command');
        return null;
      }
      return this.executeParsedAction(parsed, parsed.transcript || 'Voice Audio');
    } catch (err) {
      console.warn('Failed to parse Gemini audio output:', err);
      return null;
    }
  }

  /**
   * Execute application state change based on structured intent
   */
  private executeParsedAction(
    parsed: GeminiParsedCommand,
    rawQuery: string
  ): CommandProcessResult {
    const examStore = useExamStore.getState();
    const context = getAssistantContext();
    const actionUpper = (parsed.action || '').toUpperCase().trim();
    const queryLower = (rawQuery || '').toLowerCase();
    const replyLower = (parsed.reply || '').toLowerCase();
    let actionExecuted: string = parsed.action;
    /**
     * What actually gets said. Defaults to the model's own wording, but
     * state-confirming actions replace it with deterministic text: the reply
     * has to carry the fact itself, and the store's own announcement for the
     * same action is suppressed so the two cannot interrupt each other.
     */
    let spokenReply = parsed.reply;
    const isHindi =
      context.voiceLanguageMode === 'hi-IN' ||
      context.isHindiMode ||
      voiceRecognition.isHindiMode() ||
      /[\u0900-\u097F]/.test(rawQuery) ||
      (context.voiceLanguageMode !== 'en-US' && isHindiPreferred(rawQuery));

    // =========================================================================
    // STRICT EXAM INTEGRITY INTERCEPTOR:
    // If the candidate is on the live exam screen, NEVER solve or reveal answers!
    // =========================================================================
    // EXAM INTEGRITY GUARD WITH DIAGRAM ACCESSIBILITY EXEMPTION
    // =========================================================================
    const isDiagramQuery =
      /(?:diagram|chart|graph|figure|visual|image|चित्र|आरेख|ग्राफ)\b/i.test(rawQuery) &&
      (/(?:explain|describe|read|what|tell|batao|samjhao|dekho|khol|open|show|dikhao|detail|breakdown|guide)\b/i.test(rawQuery) ||
        /^(?:explain\s+diagram|describe\s+diagram|read\s+diagram|diagram\s+explain|diagram\s+samjhao|chart\s+samjhao|diagram|chart|figure)$/i.test(rawQuery.trim()));

    if (context.activeView === 'exam' && isDiagramQuery) {
      window.dispatchEvent(new CustomEvent('dristix:open-diagram-explainer'));
      const q = context.currentQuestion;
      let reply = 'Opening AI Diagram Explainer.';
      if (q) {
        if (q.diagramAiExplanation?.audioNarration) {
          reply = q.diagramAiExplanation.audioNarration;
        } else if (q.diagramDescription) {
          reply = `Question ${q.questionNumber} diagram: ${q.diagramDescription}. Opening AI Diagram Explainer.`;
        } else if (q.diagramUrl) {
          reply = `Opening AI Diagram Explainer for Question ${q.questionNumber}. Analyzing visual elements now.`;
        } else {
          reply = `Question ${q.questionNumber} does not have an attached diagram or visual chart.`;
        }
      }
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'EXPLAIN_DIAGRAM',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Explained Visual Diagram',
      };
    }

    const isSolveOrAnswerIntent =
      actionUpper === 'EXAM_INTEGRITY_REFUSAL' ||
      actionUpper === 'EXPLANATION' ||
      actionUpper === 'HINT' ||
      actionUpper === 'SOLVE' ||
      queryLower.includes('solve') ||
      queryLower.includes('solution') ||
      queryLower.includes('answer batao') ||
      queryLower.includes('sahi option') ||
      queryLower.includes('sahi answer') ||
      queryLower.includes('correct answer') ||
      queryLower.includes('what is the answer') ||
      queryLower.includes('explain this') ||
      queryLower.includes('explain question') ||
      queryLower.includes('sawal samjhao') ||
      queryLower.includes('answer kya hai');

    if (context.activeView === 'exam' && !isDiagramQuery && isSolveOrAnswerIntent) {
      soundEffects.playTimerAlert();
      const safeReply = isHindi
        ? 'परीक्षा के दौरान उत्तर बताना या सवाल हल करना वर्जित है। आप मुझसे प्रश्न पढ़ने, विकल्प चुनने, अगला सवाल देखने या शेष समय पूछने के लिए कह सकते हैं।'
        : 'Exam integrity mode is active. I cannot solve questions or provide answers during the live test. You can ask me to read the question, navigate, select your chosen option, or check the time.';

      useAnnouncerStore.getState().announce(safeReply, 'assertive', true);
      return {
        success: true,
        intent: 'EXAM_INTEGRITY_REFUSAL',
        userQuery: rawQuery,
        assistantReply: safeReply,
        actionExecuted: 'Exam Integrity Protected (Answer Withheld)',
      };
    }

    const all = [...examStore.availableExams, ...examStore.availablePracticeDrills];
    const matchedRequestedExam = matchExamFromQuery(rawQuery, parsed.param, all);

    // =========================================================
    // 1. LIST AVAILABLE EXAMS / DRILLS (CONCISE & ACCURATE)
    // Evaluated with priority so asking for available tests lists test details
    // concisely with the real question count instead of full monologues or 0 questions.
    // =========================================================
    const isListExamsIntent =
      !matchedRequestedExam &&
      (
        actionUpper === 'LIST_EXAMS' ||
        actionUpper === 'LIST_TESTS' ||
        actionUpper === 'AVAILABLE_EXAMS' ||
        actionUpper === 'AVAILABLE_TESTS' ||
        queryLower.includes('list exam') ||
        queryLower.includes('list test') ||
        queryLower.includes('list mock') ||
        queryLower.includes('available exam') ||
        queryLower.includes('available test') ||
        queryLower.includes('avalable') ||
        queryLower.includes('exams ke naam') ||
        queryLower.includes('test ke naam') ||
        queryLower.includes('tests ke naam') ||
        queryLower.includes('kaun kaun') ||
        queryLower.includes('kon kon') ||
        queryLower.includes('kaun se') ||
        queryLower.includes('kon se') ||
        queryLower.includes('konsa') ||
        queryLower.includes('kaun sa') ||
        queryLower.includes('kya kya') ||
        queryLower.includes('uplabdh') ||
        queryLower.includes('which test') ||
        queryLower.includes('what test') ||
        queryLower.includes('which exam') ||
        queryLower.includes('what exam') ||
        ((queryLower.includes('page') || queryLower.includes('yahan') || queryLower.includes('yaha')) &&
          (queryLower.includes('test') || queryLower.includes('exam') || queryLower.includes('mock')))
      );

    if (isListExamsIntent) {
      if (context.activeView !== 'catalog') {
        examStore.returnToCatalog();
        examStore.setPortalTab('exams');
      }

      if (context.portalTab === 'practice' && !queryLower.includes('mock')) {
        const drills = context.availableDrills;
        const topDrills = drills.slice(0, 4);
        const names = topDrills
          .map((d, idx) => {
            const qCount = d.questionCount || (d as any).totalQuestions || 5;
            return `${idx + 1}. ${d.title} (${d.durationMinutes} ${isHindi ? 'मिनट' : 'mins'}, ${qCount} ${isHindi ? 'प्रश्न' : 'questions'})`;
          })
          .join('; ');
        const moreCount = drills.length > 4 ? (isHindi ? ` तथा ${drills.length - 4} अन्य अभ्यास।` : ` plus ${drills.length - 4} more drills.`) : '';
        const reply = isHindi
          ? `प्रैक्टिस एरिना में कुल ${drills.length} अभ्यास उपलब्ध हैं: ${names}${moreCount}। शुरू करने के लिए अभ्यास का नाम बोलें।`
          : `The Practice Arena contains ${drills.length} practice drills: ${names}${moreCount}. Say "Start" followed by a drill name to begin.`;
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'LIST_PRACTICE_DRILLS',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Listed Available Practice Drills',
        };
      }

      const exams = context.availableExams;
      const topExams = exams.slice(0, 4);
      const names = topExams
        .map((e, idx) => {
          const qCount = e.questionCount || (e as any).totalQuestions || 5;
          return `${idx + 1}. ${e.title} (${e.durationMinutes} ${isHindi ? 'मिनट' : 'mins'}, ${qCount} ${isHindi ? 'प्रश्न' : 'questions'})`;
        })
        .join('; ');
      const moreCount = exams.length > 4 ? (isHindi ? ` तथा ${exams.length - 4} अन्य टेस्ट।` : ` plus ${exams.length - 4} more tests.`) : '';
      const reply = isHindi
        ? `वर्तमान में कुल ${exams.length} मॉक टेस्ट उपलब्ध हैं: ${names}${moreCount}। शुरू करने के लिए टेस्ट का नाम बोलें या "पहला टेस्ट शुरू करो" कहें।`
        : `There are ${exams.length} mock tests available: ${names}${moreCount}. Say "Start" followed by a test name or say "Start Test 1" to begin.`;
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'LIST_EXAMS',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Listed Available Mock Exams',
      };
    }

    // =========================================================
    // 2. TOP-LEVEL TAB & WORKSPACE NAVIGATION INTERCEPTORS
    // Switch between Analytics, Practice Arena, Mock Exams catalog.
    // =========================================================

    // 2a. Analytics / Performance Dashboard Tab
    const isAnalyticsNavIntent =
      actionUpper === 'ANALYTICS' ||
      actionUpper === 'VIEW_ANALYTICS' ||
      actionUpper === 'OPEN_ANALYTICS' ||
      (
        (
          queryLower.includes('analytics') ||
          queryLower.includes('एनालिटिक्स') ||
          queryLower.includes('performance') ||
          queryLower.includes('परफॉरमेंस') ||
          queryLower.includes('score page') ||
          queryLower.includes('meri report') ||
          queryLower.includes('my stats') ||
          queryLower.includes('report tab') ||
          queryLower.includes('stats tab') ||
          (queryLower.includes('score') && (queryLower.includes('tab') || queryLower.includes('page') || queryLower.includes('dikhao') || queryLower.includes('kholo') || queryLower.includes('open') || queryLower.includes('go to')))
        ) &&
        !queryLower.includes('history') &&
        !queryLower.includes('accuracy') &&
        !queryLower.includes('best score') &&
        !queryLower.includes('questions solved')
      );

    if (isAnalyticsNavIntent) {
      if (context.activeView === 'exam' && !examStore.isSubmitted) {
        examStore.setSubmitModalOpen(true);
        soundEffects.playTimerAlert();
        const reply = isHindi
          ? 'परीक्षा सबमिट किए बिना आप एनालिटिक्स नहीं देख सकते। कृपया पहले अपनी परीक्षा सबमिट करें।'
          : 'You cannot leave the exam before submitting it. Submit confirmation dialog is open. Please submit your test first.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'SUBMIT_EXAM',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Opened Submit Modal (Exit Prevented)',
        };
      }

      examStore.openAnalytics();
      soundEffects.playSelect();
      const reply = isHindi
        ? `परफॉरमेंस एनालिटिक्स डैशबोर्ड खुल गया है। यहाँ आपके कुल ${context.totalSubmissions || 0} टेस्टों का रिकॉर्ड उपलब्ध है। अपनी समरी सुनने के लिए "समरी पढ़ो" बोलें, या टेस्ट पर लौटने के लिए "वापस जाओ" कहें।`
        : `Switched to Performance Analytics Dashboard. Here you can review your ${context.totalSubmissions || 0} completed tests. Say "Listen to summary" to hear your statistics, or "Back to tests" to return.`;
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'VIEW_ANALYTICS',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Switched to Analytics Dashboard',
      };
    }

    // 2b. Practice Arena Tab Navigation
    const isPracticeTabIntent =
      isPracticeTabNavigation(rawQuery) ||
      actionUpper === 'PRACTICE_TAB' ||
      actionUpper === 'PRACTICE_PAGE' ||
      actionUpper === 'PRACTICE_ARENA' ||
      actionUpper === 'SWITCH_PRACTICE' ||
      actionUpper === 'NAVIGATE_PRACTICE';

    if (isPracticeTabIntent) {
      if (context.activeView === 'exam' && !examStore.isSubmitted) {
        examStore.setSubmitModalOpen(true);
        soundEffects.playTimerAlert();
        const safeReply = isHindi
          ? 'परीक्षा सबमिट किए बिना आप बाहर नहीं जा सकते। सबमिट पुष्टि विंडो खुल गई है। कृपया पहले अपनी परीक्षा सबमिट करें।'
          : 'You cannot leave the exam before submitting it. The submit confirmation window is now open. Please submit your test first.';
        useAnnouncerStore.getState().announce(safeReply, 'assertive', true);
        return {
          success: true,
          intent: 'SUBMIT_EXAM',
          userQuery: rawQuery,
          assistantReply: safeReply,
          actionExecuted: 'Opened Submit Modal (Exit Prevented)',
        };
      }

      examStore.returnToCatalog();
      examStore.setPortalTab('practice');
      soundEffects.playSuccess();

      const drills = context.availableDrills;
      const topDrills = drills.slice(0, 4);
      const names = topDrills
        .map((d, idx) => {
          const qCount = d.questionCount || (d as any).totalQuestions || 5;
          return `${idx + 1}. ${d.title} (${d.durationMinutes} ${isHindi ? 'मिनट' : 'mins'}, ${qCount} ${isHindi ? 'प्रश्न' : 'questions'})`;
        })
        .join('; ');
      const moreCount = drills.length > 4 ? (isHindi ? ` तथा ${drills.length - 4} अन्य अभ्यास।` : ` plus ${drills.length - 4} more drills.`) : '';
      const reply = drills.length
        ? (isHindi
            ? `प्रैक्टिस एरिना टैब पर आ गए हैं। कुल ${drills.length} अभ्यास उपलब्ध हैं: ${names}${moreCount}। शुरू करने के लिए अभ्यास का नाम बोलें।`
            : `Switched to the Practice Arena tab. ${drills.length} practice drills are available: ${names}${moreCount}. Say "Start" followed by a drill name to begin.`)
        : (isHindi
            ? 'प्रैक्टिस एरिना टैब पर आ गए हैं। अभी कोई अभ्यास उपलब्ध नहीं है।'
            : 'Switched to the Practice Arena tab. No practice drills are available right now. Say "Go to mock test page" to see the mock examinations.');

      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'PRACTICE_TAB',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Opened Practice Tab (No Drill Started)',
      };
    }

    // 2c. Mock Tests / Examinations Catalog Tab Navigation
    const isExamsCatalogIntent =
      actionUpper === 'RETURN_CATALOG' ||
      actionUpper === 'CATALOG' ||
      actionUpper === 'EXAMS_TAB' ||
      actionUpper === 'MOCK_TESTS_TAB' ||
      queryLower === 'mock tests' ||
      queryLower === 'mock test' ||
      queryLower === 'exams' ||
      queryLower === 'tests' ||
      queryLower.includes('mock test tab') ||
      queryLower.includes('mock test page') ||
      queryLower.includes('mock test section') ||
      queryLower.includes('switch to mock') ||
      queryLower.includes('switch to exam') ||
      queryLower.includes('go to mock') ||
      queryLower.includes('go to exam') ||
      queryLower.includes('open mock') ||
      queryLower.includes('choose another exam') ||
      queryLower.includes('choose another test') ||
      queryLower.includes('back to tests') ||
      queryLower.includes('back to exam') ||
      queryLower.includes('test catalog') ||
      queryLower.includes('exam catalog') ||
      queryLower.includes('मॉक टेस्ट पेज') ||
      queryLower.includes('मॉक टेस्ट टैब') ||
      queryLower.includes('टेस्ट पेज पर जाओ');

    if (isExamsCatalogIntent) {
      if (context.activeView === 'exam' && !examStore.isSubmitted) {
        examStore.setSubmitModalOpen(true);
        soundEffects.playTimerAlert();
        const safeReply = isHindi
          ? 'परीक्षा सबमिट किए बिना आप बाहर नहीं जा सकते। सबमिट पुष्टि विंडो खुल गई है। कृपया पहले अपनी परीक्षा सबमिट करें।'
          : 'You cannot leave the exam before submitting it. Submit confirmation dialog is open. Please submit your test first.';
        useAnnouncerStore.getState().announce(safeReply, 'assertive', true);
        return {
          success: true,
          intent: 'SUBMIT_EXAM',
          userQuery: rawQuery,
          assistantReply: safeReply,
          actionExecuted: 'Opened Submit Modal (Exit Prevented)',
        };
      }

      examStore.returnToCatalog();
      examStore.setPortalTab('exams');
      soundEffects.playSuccess();

      const exams = context.availableExams;
      const topExams = exams.slice(0, 4);
      const names = topExams
        .map((e, idx) => {
          const qCount = e.questionCount || (e as any).totalQuestions || 5;
          return `${idx + 1}. ${e.title} (${e.durationMinutes} ${isHindi ? 'मिनट' : 'mins'}, ${qCount} ${isHindi ? 'प्रश्न' : 'questions'})`;
        })
        .join('; ');
      const moreCount = exams.length > 4 ? (isHindi ? ` तथा ${exams.length - 4} अन्य टेस्ट।` : ` plus ${exams.length - 4} more tests.`) : '';
      const reply = exams.length
        ? (isHindi
            ? `मॉक टेस्ट कैटलॉग खुल गया है। कुल ${exams.length} टेस्ट उपलब्ध हैं: ${names}${moreCount}। शुरू करने के लिए टेस्ट का नाम बोलें।`
            : `Switched to Mock Examinations Catalog. ${exams.length} tests available: ${names}${moreCount}. Say "Start" followed by a test name to begin.`)
        : (isHindi
            ? 'मॉक टेस्ट कैटलॉग खुल गया है। अभी कोई टेस्ट उपलब्ध नहीं है।'
            : 'Switched to Mock Examinations Catalog. No tests available right now.');

      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'RETURN_CATALOG',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Navigated to Mock Examinations Catalog',
      };
    }

    // Continue Exam / Resume Exam / Cancel Submit Interceptor
    const isContinueExamIntent =
      actionUpper === 'CONTINUE_EXAM' ||
      actionUpper === 'RESUME_EXAM' ||
      actionUpper === 'CANCEL_SUBMIT' ||
      queryLower.includes('continue to exam') ||
      queryLower.includes('continue exam') ||
      queryLower.includes('resume exam') ||
      queryLower.includes('return to exam') ||
      queryLower.includes('back to exam') ||
      queryLower.includes('cancel submit') ||
      queryLower.includes('cancel submission') ||
      (examStore.isSubmitModalOpen && (
        queryLower.includes('continue') ||
        queryLower.includes('resume') ||
        queryLower.includes('cancel') ||
        queryLower === 'no' ||
        queryLower === 'nahi' ||
        queryLower === 'wapas'
      ));

    if (isContinueExamIntent && context.activeView === 'exam') {
      const wasModalOpen = examStore.isSubmitModalOpen;
      examStore.setSubmitModalOpen(false);
      soundEffects.playSelect();
      const q = context.currentQuestion;
      const qNum = q?.number || (examStore.currentIndex + 1);
      const reply = wasModalOpen
        ? `Submission cancelled. Resuming exam at Question ${qNum}. You can say "Read question", "Next question", or select an option.`
        : `You are continuing your active exam on Question ${qNum}. Say "Read question" to hear the question.`;
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'RESUME_EXAM',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Resumed Exam (Cancelled Submission)',
      };
    }

    // Final Submit / Confirm Submit Interceptor
    const isFinalSubmitIntent =
      actionUpper === 'FINAL_SUBMIT' ||
      actionUpper === 'CONFIRM_SUBMIT' ||
      queryLower.includes('yes, final submit') ||
      queryLower.includes('yes final submit') ||
      queryLower.includes('final submit') ||
      queryLower.includes('confirm submit') ||
      queryLower.includes('submit final') ||
      (examStore.isSubmitModalOpen && (
        queryLower.includes('yes submit') ||
        queryLower.includes('submit exam') ||
        queryLower === 'yes' ||
        queryLower === 'submit' ||
        queryLower === 'confirm' ||
        queryLower === 'haan'
      ));

    if (isFinalSubmitIntent && context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(false);
      soundEffects.playSuccess();
      void examStore.submitExam();
      const reply = 'Final submission confirmed. Submitting your examination now...';
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'FINAL_SUBMIT',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Final Submitted Exam',
      };
    }

    // Diagnostic & Analytics Report Summary Interceptor (Active when exam is submitted or in report view)
    const isReportSummaryIntent =
      (context.activeView === 'report' || examStore.isSubmitted) &&
      !isContinueExamIntent &&
      !isFinalSubmitIntent &&
      (
        actionUpper === 'READ_REPORT_SUMMARY' ||
        actionUpper === 'SUMMARY' ||
        actionUpper === 'REPORT' ||
        actionUpper === 'ANALYTICS' ||
        actionUpper === 'RESULT' ||
        queryLower.includes('summary') ||
        queryLower.includes('समरी') ||
        queryLower.includes('analytics') ||
        queryLower.includes('एनालिटिक्स') ||
        queryLower.includes('report') ||
        queryLower.includes('रिपोर्ट') ||
        queryLower.includes('result') ||
        queryLower.includes('रिजल्ट') ||
        queryLower.includes('score') ||
        queryLower.includes('स्कोर') ||
        queryLower.includes('performance') ||
        queryLower.includes('parinam') ||
        queryLower.includes('kitne sahi') ||
        queryLower.includes('kitne number') ||
        queryLower.includes('explain result') ||
        queryLower.includes('explain report') ||
        queryLower.includes('explain analytics')
      );

    if (isReportSummaryIntent) {
      soundEffects.playSelect();
      const rep = context.diagnosticReport || examStore.getDiagnosticReport();
      const summaryText =
        rep?.verbalSummary?.join(' ') ||
        `Overall Score: ${rep?.totalScore || 0} out of ${rep?.maxScore || 0} points (${rep?.scorePercentage || 0}%). Attempted: ${rep?.attemptedCount || 0} questions (${rep?.correctCount || 0} correct, ${rep?.incorrectCount || 0} incorrect). Unattempted: ${rep?.unattemptedCount || 0}.`;
      const reply = `Performance Diagnostic and Analytics Report for "${rep?.examTitle || 'Exam'}": You scored ${rep?.totalScore || 0} out of ${rep?.maxScore || 0} points, which is ${rep?.scorePercentage || 0} percent. ${summaryText} You can say "Retake test" or "Choose another exam".`;
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'READ_REPORT_SUMMARY',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Explained Diagnostic & Analytics Report',
      };
    }

    // Notifications Interceptor (Evaluated BEFORE catalog navigation so "catalog notifications" never returns to catalog!)
    const isNotificationIntent =
      actionUpper === 'NOTIFICATIONS' ||
      actionUpper === 'READ_NOTIFICATIONS' ||
      actionUpper === 'OPEN_NOTIFICATIONS' ||
      actionUpper === 'CLOSE_NOTIFICATIONS' ||
      queryLower.includes('notification') ||
      queryLower.includes('notif') ||
      queryLower.includes('नोटिफिकेशन') ||
      queryLower.includes('सूचना');

    if (isNotificationIntent) {
      const isClose =
        actionUpper === 'CLOSE_NOTIFICATIONS' ||
        queryLower.includes('close') ||
        queryLower.includes('band') ||
        queryLower.includes('hatao') ||
        queryLower.includes('dismiss');

      if (isClose) {
        useNotificationStore.getState().toggleOpen(false);
        useNotificationStore.getState().closeNotificationDetail();
        soundEffects.playSelect();
        const reply = isHindi
          ? 'नोटिफिकेशन पैनल बंद कर दिया गया है।'
          : 'Notification panel closed.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'CLOSE_NOTIFICATIONS',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Closed Notifications',
        };
      }

      useNotificationStore.getState().toggleOpen(true);
      soundEffects.playSelect();

      const notifStore = useNotificationStore.getState();
      const notifs = notifStore.notifications;

      if (!notifs || notifs.length === 0) {
        const reply = isHindi
          ? 'नोटिफिकेशन पैनल खुल गया है। वर्तमान में आपके पास कोई नया या पुराना नोटिफिकेशन नहीं है।'
          : 'Notifications panel opened. You have no notifications at this time.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'READ_NOTIFICATIONS',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Opened Notifications (Empty)',
        };
      }

      const unreadNotifs = notifs.filter((n) => !n.isRead);
      const pastNotifs = notifs.filter((n) => n.isRead);

      let speech = isHindi ? 'नोटिफिकेशन पैनल खुल गया है। ' : 'Notifications panel opened. ';

      if (unreadNotifs.length > 0) {
        speech += isHindi
          ? `आपके पास ${unreadNotifs.length} नए अपठित नोटिफिकेशन हैं: `
          : `You have ${unreadNotifs.length} unread notification${unreadNotifs.length > 1 ? 's' : ''}: `;

        unreadNotifs.forEach((n, idx) => {
          const testAttached = n.testDetails?.testTitle
            ? (isHindi
                ? ` जुड़ा हुआ टेस्ट: "${n.testDetails.testTitle}"। शुरू करने के लिए "टेस्ट शुरू करो" बोलें।`
                : ` Attached test: "${n.testDetails.testTitle}". Say "Start test" to begin.`)
            : '';
          speech += `${idx + 1}. ${n.title} - ${n.message}.${testAttached} `;
        });
      } else {
        speech += isHindi ? 'कोई नया अपठित नोटिफिकेशन नहीं है। ' : 'You have no new unread notifications. ';
      }

      if (pastNotifs.length > 0) {
        speech += isHindi ? 'पुराने पढ़े हुए नोटिफिकेशन: ' : 'Previously read past notifications: ';
        pastNotifs.slice(0, 3).forEach((n, idx) => {
          const testAttached = n.testDetails?.testTitle
            ? (isHindi ? ` (टेस्ट: ${n.testDetails.testTitle})` : ` (Test: ${n.testDetails.testTitle})`)
            : '';
          speech += `${idx + 1}. ${n.title}${testAttached}। `;
        });
        if (pastNotifs.length > 3) {
          speech += isHindi
            ? `तथा ${pastNotifs.length - 3} अन्य पुराने नोटिफिकेशन। `
            : `plus ${pastNotifs.length - 3} older notifications. `;
        }
      }

      speech += isHindi
        ? 'टेस्ट शुरू करने के लिए "टेस्ट शुरू करो" बोलें या बंद करने के लिए "नोटिफिकेशन बंद करो" बोलें।'
        : 'Say "Start test" to begin any attached examination, or "Close notification" to close.';

      useAnnouncerStore.getState().announce(speech.trim(), 'assertive', true);
      return {
        success: true,
        intent: 'READ_NOTIFICATIONS',
        userQuery: rawQuery,
        assistantReply: speech.trim(),
        actionExecuted: 'Read Notifications Aloud',
      };
    }

    // Return to Catalog / Mock Test Page / Choose Another Exam Interceptor
    // MUST BE EVALUATED BEFORE isListExamsIntent & isStartExamIntent so phrases like "back to mock examination page",
    // "open mock test page" or "go on mocktest page" navigate to catalog!
    const isReturnCatalogIntent =
      !matchedRequestedExam &&
      !isContinueExamIntent &&
      !isFinalSubmitIntent &&
      !queryLower.includes('to exam') &&
      !queryLower.includes('to test') &&
      !queryLower.includes('notification') &&
      !queryLower.includes('notif') &&
      !queryLower.includes('सूचना') &&
      (
        actionUpper === 'RETURN_CATALOG' ||
        actionUpper === 'RETURN' ||
        actionUpper === 'CATALOG' ||
        actionUpper === 'EXAM_CATALOG' ||
        actionUpper === 'MOCK_TEST_PAGE' ||
        actionUpper === 'MOCK_TESTS' ||
        actionUpper === 'MOCKTEST_PAGE' ||
        actionUpper === 'MOCKTEST' ||
        actionUpper === 'NAVIGATE_CATALOG' ||
        actionUpper === 'NAVIGATE_BACK' ||
        actionUpper === 'BACK' ||
        actionUpper === 'EXIT' ||
        actionUpper === 'HOME' ||
        queryLower.includes('back to') ||
        queryLower.includes('return to') ||
        queryLower.includes('go back') ||
        queryLower.includes('back to moak') ||
        queryLower.includes('moak examination') ||
        queryLower.includes('mock examination') ||
        queryLower.includes('examination page') ||
        queryLower.includes('mock test page') ||
        queryLower.includes('mocktest page') ||
        queryLower.includes('go on mock') ||
        queryLower.includes('go to mock') ||
        queryLower.includes('take me to mock') ||
        queryLower.includes('back to mock') ||
        queryLower.includes('return to mock') ||
        queryLower.includes('open mock test page') ||
        queryLower.includes('open mocktest page') ||
        queryLower.includes('मॉक टेस्ट पेज') ||
        queryLower.includes('मॉकटेस्ट पेज') ||
        queryLower.includes('मॉक टेस्ट पर') ||
        queryLower.includes('मॉकटेस्ट पर') ||
        queryLower.includes('गो ऑन') ||
        queryLower.includes('गो टू') ||
        queryLower.includes('choose another') ||
        queryLower.includes('another exam') ||
        queryLower.includes('another test') ||
        queryLower.includes('dusra exam') ||
        queryLower.includes('dusra test') ||
        queryLower.includes('test page') ||
        queryLower.includes('tests page') ||
        queryLower.includes('exam page') ||
        queryLower.includes('exams page') ||
        queryLower.includes('catalog page') ||
        queryLower.includes('catalog par') ||
        queryLower.includes('all exams') ||
        queryLower.includes('all tests') ||
        queryLower.includes('all mock') ||
        queryLower.includes('sare test') ||
        queryLower.includes('sare exam') ||
        queryLower.includes('sare mock') ||
        queryLower.includes('test series') ||
        queryLower.includes('home page') ||
        queryLower.includes('pehle page') ||
        queryLower.includes('main page') ||
        // When on the report or analytics screen, any request to see tests, exams, catalog, or return goes to catalog!
        ((context.activeView === 'report' || context.activeView === 'analytics') && (
          queryLower.includes('mock test') ||
          queryLower.includes('mocktest') ||
          queryLower.includes('test') ||
          queryLower.includes('tests') ||
          queryLower.includes('exam') ||
          queryLower.includes('exams') ||
          queryLower.includes('catalog') ||
          queryLower.includes('home') ||
          queryLower.includes('back') ||
          queryLower.includes('wapas')
        ))
      );

    if (isReturnCatalogIntent) {
      if (context.activeView === 'exam' && !examStore.isSubmitted) {
        examStore.setSubmitModalOpen(true);
        soundEffects.playTimerAlert();
        const safeReply = isHindi
          ? 'परीक्षा सबमिट किए बिना आप बाहर नहीं जा सकते। सबमिट पुष्टि विंडो खुल गई है। कृपया पहले अपनी परीक्षा सबमिट करें।'
          : 'You cannot leave the exam before submitting it. The submit confirmation window is now open. Please submit your test first.';
        useAnnouncerStore.getState().announce(safeReply, 'assertive', true);
        return {
          success: true,
          intent: 'SUBMIT_EXAM',
          userQuery: rawQuery,
          assistantReply: safeReply,
          actionExecuted: 'Opened Submit Modal (Exit Prevented)',
        };
      }

      examStore.returnToCatalog();
      examStore.setPortalTab('exams');
      soundEffects.playSuccess();
      const reply = isHindi
        ? 'मॉक टेस्ट कैटलॉग पर वापस आ गए हैं। सभी उपलब्ध टेस्ट स्क्रीन पर प्रदर्शित हैं। शुरू करने के लिए किसी भी टेस्ट का नाम बोलें।'
        : 'Returned to the Examination Catalog. All available mock tests are displayed on your screen. Say "Start SSC CGL" or "Start Exam 1" to begin.';
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'RETURN_CATALOG',
        userQuery: rawQuery,
        assistantReply: reply,
        actionExecuted: 'Returned to Mock Test Catalog',
      };
    }


    // Handle Accessibility Settings & Shortcuts with priority so they are never hijacked by exam starts
    const isSettingsOrA11yIntent =
      actionUpper === 'LIST_THEMES' ||
      actionUpper === 'SELECT_THEME' ||
      actionUpper === 'SET_FONT_SIZE' ||
      actionUpper === 'OPEN_SETTINGS' ||
      actionUpper === 'SETTINGS' ||
      actionUpper === 'OPEN_ACCESSIBILITY' ||
      actionUpper === 'ACCESSIBILITY' ||
      actionUpper === 'CLOSE_SETTINGS' ||
      actionUpper === 'OPEN_SHORTCUTS' ||
      actionUpper === 'SHORTCUTS' ||
      actionUpper === 'CLOSE_SHORTCUTS' ||
      queryLower.includes('setting') ||
      queryLower.includes('accessibility') ||
      queryLower.includes('preference') ||
      queryLower.includes('shortcut') ||
      queryLower.includes('theme') ||
      queryLower.includes('contrast') ||
      queryLower.includes('font size') ||
      queryLower.includes('font scale') ||
      queryLower.includes('text scale') ||
      queryLower.includes('सेटिंग') ||
      queryLower.includes('एक्सेसिबिलिटी') ||
      queryLower.includes('प्राथमिकता') ||
      queryLower.includes('थीम') ||
      queryLower.includes('कंट्रास्ट') ||
      queryLower.includes('शॉर्टकट');

    if (isSettingsOrA11yIntent) {
      // 1. Theme Listing
      const isListThemes =
        actionUpper === 'LIST_THEMES' ||
        ((queryLower.includes('theme') || queryLower.includes('थीम')) &&
        (
          queryLower.includes('kaun') ||
          queryLower.includes('kon') ||
          queryLower.includes('kya') ||
          queryLower.includes('batao') ||
          queryLower.includes('naam') ||
          queryLower.includes('name') ||
          queryLower.includes('konsi') ||
          queryLower.includes('available') ||
          queryLower.includes('list') ||
          queryLower.includes('show') ||
          queryLower.includes('sare') ||
          queryLower.includes('saare') ||
          queryLower.includes('all') ||
          queryLower.includes('kitne') ||
          queryLower.includes('what') ||
          queryLower.includes('options')
        ) &&
        !queryLower.includes('high contrast') &&
        !queryLower.includes('liquid glass') &&
        !queryLower.includes('teal') &&
        !queryLower.includes('cream'));

      if (isListThemes) {
        const reply = isHindi
          ? 'सिस्टम में कुल 4 एक्सेसिबिलिटी थीम उपलब्ध हैं: 1. हाई कंट्रास्ट थीम (गहरा काला और इलेक्ट्रिक यलो, 21:1 अधिकतम कंट्रास्ट), 2. डार्क थीम (चारकोल ब्लैक और एमराल्ड ग्रीन), 3. टील एंड क्रीम थीम (वॉर्म आइवरी और गहरा टील), और 4. लिक्विड ग्लास थीम (फ़्रॉस्टेड क्रिस्टल पर्पल)। किसी भी थीम को लगाने के लिए बोलें: "हाई कंट्रास्ट थीम लगाओ" या "डार्क थीम चुनो"।'
          : 'There are 4 accessibility themes available: 1. High Contrast theme (pure black and electric yellow, 21:1 maximum contrast), 2. Charcoal Dark theme (matte charcoal and emerald green), 3. Teal & Cream theme (warm ivory and deep teal), and 4. Liquid Glass theme (frosted light amethyst). Say "Select High Contrast theme" or "Select Dark theme" to apply any of them.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'LIST_THEMES',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Listed Available Themes',
        };
      }

      // 2. High Contrast Theme Selection
      const isHighContrast =
        (actionUpper === 'SELECT_THEME' && parsed.param === 'high-contrast') ||
        queryLower.includes('high contrast') ||
        queryLower.includes('हाई कंट्रास्ट') ||
        (queryLower.includes('contrast') && (
          queryLower.includes('high') ||
          queryLower.includes('select') ||
          queryLower.includes('apply') ||
          queryLower.includes('set') ||
          queryLower.includes('lagao') ||
          queryLower.includes('karo') ||
          queryLower.includes('chuno') ||
          queryLower.includes('theme') ||
          queryLower.includes('थीम')
        ));

      if (isHighContrast) {
        usePreferencesStore.getState().setTheme('high-contrast');
        soundEffects.playSelect();
        const reply = isHindi
          ? 'हाई कंट्रास्ट थीम लागू कर दी गई है। बैकग्राउंड गहरा काला और टेक्स्ट ब्राइट यलो हो गया है।'
          : 'High Contrast theme has been applied with pure black background and electric yellow text.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'SELECT_THEME',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Applied High Contrast Theme',
        };
      }

      // 3. Dark Theme Selection
      const isDarkTheme =
        (actionUpper === 'SELECT_THEME' && parsed.param === 'dark') ||
        (!isHighContrast &&
        (queryLower.includes('dark') || queryLower.includes('डार्क') || queryLower.includes('night mode') || queryLower.includes('नाइट मोड') || queryLower.includes('काला थीम')) &&
        (
          queryLower.includes('theme') ||
          queryLower.includes('थीम') ||
          queryLower.includes('mode') ||
          queryLower.includes('मोड') ||
          queryLower.includes('select') ||
          queryLower.includes('apply') ||
          queryLower.includes('set') ||
          queryLower.includes('lagao') ||
          queryLower.includes('karo') ||
          queryLower.includes('chuno')
        ));

      if (isDarkTheme) {
        usePreferencesStore.getState().setTheme('dark');
        soundEffects.playSelect();
        const reply = isHindi
          ? 'डार्क थीम लागू कर दी गई है। चारकोल बैकग्राउंड और एमराल्ड ग्रीन एक्सेंट सेट हो गए हैं।'
          : 'Charcoal Dark theme has been applied with emerald green accents.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'SELECT_THEME',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Applied Dark Theme',
        };
      }

      // 4. Teal & Cream Theme Selection
      const isTealCream =
        (actionUpper === 'SELECT_THEME' && (parsed.param === 'teal-cream' || parsed.param === 'cream')) ||
        ((queryLower.includes('teal') || queryLower.includes('cream') || queryLower.includes('ivory') || queryLower.includes('light') || queryLower.includes('लाइट') || queryLower.includes('क्रीम') || queryLower.includes('टील')) &&
        (
          queryLower.includes('theme') ||
          queryLower.includes('थीम') ||
          queryLower.includes('mode') ||
          queryLower.includes('मोड') ||
          queryLower.includes('select') ||
          queryLower.includes('apply') ||
          queryLower.includes('set') ||
          queryLower.includes('lagao') ||
          queryLower.includes('karo') ||
          queryLower.includes('chuno')
        ));

      if (isTealCream) {
        usePreferencesStore.getState().setTheme('teal-cream');
        soundEffects.playSelect();
        const reply = isHindi
          ? 'टील एंड क्रीम थीम लागू कर दी गई है। वॉर्म आइवरी बैकग्राउंड और गहरा टील सेट हो गया है।'
          : 'Teal & Cream theme has been applied with warm ivory background and deep teal accents.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'SELECT_THEME',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Applied Teal & Cream Theme',
        };
      }

      // 5. Liquid Glass Theme Selection
      const isLiquidGlass =
        (actionUpper === 'SELECT_THEME' && (parsed.param === 'liquid-glass' || parsed.param === 'glass')) ||
        ((queryLower.includes('glass') || queryLower.includes('liquid') || queryLower.includes('purple') || queryLower.includes('frosted') || queryLower.includes('ग्लास') || queryLower.includes('लिक्विड')) &&
        (
          queryLower.includes('theme') ||
          queryLower.includes('थीम') ||
          queryLower.includes('mode') ||
          queryLower.includes('मोड') ||
          queryLower.includes('select') ||
          queryLower.includes('apply') ||
          queryLower.includes('set') ||
          queryLower.includes('lagao') ||
          queryLower.includes('karo') ||
          queryLower.includes('chuno')
        ));

      if (isLiquidGlass) {
        usePreferencesStore.getState().setTheme('liquid-glass');
        soundEffects.playSelect();
        const reply = isHindi
          ? 'लिक्विड ग्लास थीम लागू कर दी गई है। फ्रॉस्टेड पर्पल क्रिस्टल सतह सेट हो गई है।'
          : 'Liquid Glass theme has been applied with frosted amethyst crystal surfaces.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'SELECT_THEME',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Applied Liquid Glass Theme',
        };
      }

      // 6. Font Scaling
      const isFontCommand =
        actionUpper === 'SET_FONT_SIZE' ||
        ((queryLower.includes('font') || queryLower.includes('फ़ॉन्ट') || queryLower.includes('फॉन्ट') || queryLower.includes('text size') || queryLower.includes('font size')) &&
        (
          queryLower.includes('badhao') ||
          queryLower.includes('ghatao') ||
          queryLower.includes('kam') ||
          queryLower.includes('bada') ||
          queryLower.includes('chhota') ||
          queryLower.includes('increase') ||
          queryLower.includes('decrease') ||
          queryLower.includes('100') ||
          queryLower.includes('125') ||
          queryLower.includes('150') ||
          queryLower.includes('175') ||
          queryLower.includes('200') ||
          queryLower.includes('reset') ||
          queryLower.includes('normal')
        ));

      if (isFontCommand) {
        const currentSize = usePreferencesStore.getState().fontSize;
        const scales: TextScale[] = [100, 125, 150, 175, 200];
        let targetSize = Number(parsed.param) as TextScale || currentSize;

        if (queryLower.includes('200')) targetSize = 200;
        else if (queryLower.includes('175')) targetSize = 175;
        else if (queryLower.includes('150')) targetSize = 150;
        else if (queryLower.includes('125')) targetSize = 125;
        else if (queryLower.includes('100') || queryLower.includes('reset') || queryLower.includes('normal') || queryLower.includes('default')) targetSize = 100;
        else if (queryLower.includes('increase') || queryLower.includes('badhao') || queryLower.includes('bada') || queryLower.includes('large') || queryLower.includes('plus')) {
          const idx = scales.indexOf(currentSize);
          targetSize = idx < scales.length - 1 ? scales[idx + 1] : scales[scales.length - 1];
        } else if (queryLower.includes('decrease') || queryLower.includes('ghatao') || queryLower.includes('kam') || queryLower.includes('chhota') || queryLower.includes('small') || queryLower.includes('minus')) {
          const idx = scales.indexOf(currentSize);
          targetSize = idx > 0 ? scales[idx - 1] : scales[0];
        }

        usePreferencesStore.getState().setFontSize(targetSize);
        soundEffects.playSelect();
        const reply = isHindi
          ? `फ़ॉन्ट का आकार ${targetSize}% पर सेट कर दिया गया है।`
          : `Font scaling set to ${targetSize}%.`;
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'SET_FONT_SIZE',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: `Set Font Size to ${targetSize}%`,
        };
      }

      const isClose =
        actionUpper === 'CLOSE_SETTINGS' ||
        actionUpper === 'CLOSE_SHORTCUTS' ||
        queryLower.includes('close') ||
        queryLower.includes('band') ||
        queryLower.includes('hatao') ||
        queryLower.includes('exit') ||
        queryLower.includes('hide') ||
        queryLower.includes('बंद') ||
        queryLower.includes('रद्द');

      const isShortcuts =
        actionUpper === 'OPEN_SHORTCUTS' ||
        actionUpper === 'CLOSE_SHORTCUTS' ||
        actionUpper === 'SHORTCUTS' ||
        queryLower.includes('shortcut') ||
        queryLower.includes('शॉर्टकट') ||
        queryLower.includes('guide') ||
        queryLower.includes('गाइड') ||
        (queryLower.includes('help') && !queryLower.includes('hint') && !queryLower.includes('solution')) ||
        (queryLower.includes('मदद') && !queryLower.includes('हल'));

      if (isShortcuts) {
        if (isClose) {
          examStore.setShortcutsOpen(false);
          soundEffects.playSelect();
          const closeReply = isHindi
            ? 'कीबोर्ड शॉर्टकट गाइड बंद कर दी गई है।'
            : 'Keyboard Shortcuts modal closed.';
          useAnnouncerStore.getState().announce(closeReply, 'assertive', true);
          return {
            success: true,
            intent: 'CLOSE_SHORTCUTS',
            userQuery: rawQuery,
            assistantReply: closeReply,
            actionExecuted: 'Closed Keyboard Shortcuts Modal',
          };
        }

        examStore.setShortcutsOpen(true);
        soundEffects.playSelect();
        const openReply = isHindi
          ? 'कीबोर्ड शॉर्टकट गाइड खुल गई है। अगले प्रश्न के लिए N, पिछले के लिए P, विकल्पों के लिए 1 से 4, समय के लिए T, और सेटिंग्स के लिए A दबाएँ।'
          : 'Keyboard Navigation Shortcuts Guide opened. Press N for Next Question, P for Previous, 1 to 4 for Options, T for Time, and A for Accessibility Preferences.';
        useAnnouncerStore.getState().announce(openReply, 'assertive', true);
        return {
          success: true,
          intent: 'OPEN_SHORTCUTS',
          userQuery: rawQuery,
          assistantReply: openReply,
          actionExecuted: 'Opened Keyboard Shortcuts Modal',
        };
      }

      if (isClose) {
        examStore.setSettingsOpen(false);
        soundEffects.playSelect();
        const closeReply = isHindi
          ? 'एक्सेसिबिलिटी सेटिंग्स बंद कर दी गई हैं।'
          : 'Accessibility Preferences modal closed.';
        useAnnouncerStore.getState().announce(closeReply, 'assertive', true);
        return {
          success: true,
          intent: 'CLOSE_SETTINGS',
          userQuery: rawQuery,
          assistantReply: closeReply,
          actionExecuted: 'Closed Accessibility Preferences Modal',
        };
      }

      examStore.setSettingsOpen(true);
      soundEffects.playSelect();
      const openReply = isHindi
        ? 'एक्सेसिबिलिटी प्राथमिकताएँ और सेटिंग्स खोल दी गई हैं। यहाँ आप थीम, कंट्रास्ट, फ़ॉन्ट का आकार और आवाज़ की गति बदल सकते हैं। बंद करने के लिए Escape दबाएँ या "सेटिंग्स बंद करो" बोलें।'
        : 'Accessibility Preferences opened. You can adjust theme contrast, font scaling, and voice settings here. Press Escape or say "Close settings" to return.';
      useAnnouncerStore.getState().announce(openReply, 'assertive', true);
      return {
        success: true,
        intent: 'OPEN_SETTINGS',
        userQuery: rawQuery,
        assistantReply: openReply,
        actionExecuted: 'Opened Accessibility Preferences Modal',
      };
    }

    // Detect if this is an exam start request (either via explicit action, matched exam, or intent in reply/query)
    const isStartExamIntent =
      !isReturnCatalogIntent &&
      !isSettingsOrA11yIntent &&
      (
        !!matchedRequestedExam ||
        actionUpper === 'START_EXAM' ||
        actionUpper === 'OPEN_EXAM' ||
        actionUpper === 'START_TEST' ||
        actionUpper === 'OPEN_TEST' ||
        actionUpper === 'SELECT_EXAM' ||
        actionUpper === 'LAUNCH_EXAM' ||
        actionUpper === 'BEGIN_EXAM' ||
        (actionUpper === 'START' && !queryLower.includes('page') && !queryLower.includes('catalog')) ||
        (actionUpper === 'OPEN' && !queryLower.includes('page') && !queryLower.includes('catalog') && (queryLower.includes('exam') || queryLower.includes('test') || queryLower.includes('mock') || queryLower.includes('drill'))) ||
        replyLower.includes('open kar') ||
        replyLower.includes('start kar') ||
        replyLower.includes('shuru kar') ||
        replyLower.includes('khol raha') ||
        queryLower.includes('open exam') ||
        queryLower.includes('exam open') ||
        queryLower.includes('start exam') ||
        queryLower.includes('exam start') ||
        queryLower.includes('exam kholo') ||
        queryLower.includes('test kholo') ||
        queryLower.includes('exam shuru') ||
        queryLower.includes('ak exam') ||
        queryLower.includes('ek exam')
      );

    if (isStartExamIntent) {
      // STRICT INTEGRITY: If candidate is taking a test, prevent switching exams before submitting
      if (context.activeView === 'exam' && !examStore.isSubmitted) {
        examStore.setSubmitModalOpen(true);
        soundEffects.playTimerAlert();
        const safeReply = isHindi
          ? 'एक परीक्षा पहले से चल रही है। सबमिट किए बिना आप इसे छोड़ नहीं सकते या दूसरा टेस्ट शुरू नहीं कर सकते।'
          : 'An exam is already running. You cannot leave or start another test before submitting this one. Submit confirmation window opened.';
        useAnnouncerStore.getState().announce(safeReply, 'assertive', true);
        return {
          success: true,
          intent: 'SUBMIT_EXAM',
          userQuery: rawQuery,
          assistantReply: safeReply,
          actionExecuted: 'Opened Submit Modal (Exam Switch Prevented)',
        };
      }

      const notifStore = useNotificationStore.getState();
      const activeTest =
        notifStore.activeNotification?.testDetails ||
        notifStore.notifications.find((n) => n.testDetails?.testId || n.testDetails?.code || n.testDetails?.testTitle)?.testDetails;

      const isNotificationContext = Boolean(
        notifStore.isOpen ||
        Boolean(notifStore.activeNotification) ||
        queryLower.includes('notification') ||
        queryLower.includes('notif') ||
        queryLower.includes('suchna') ||
        queryLower.includes('new test') ||
        queryLower.includes('naya test') ||
        queryLower.includes('naya mock') ||
        queryLower.includes('latest test')
      );

      let target: Exam | null = null;
      if (isNotificationContext && activeTest) {
        const dtId = (activeTest.testId || '').toLowerCase();
        const dtCode = (activeTest.code || '').toLowerCase();
        const dtTitle = (activeTest.testTitle || '').toLowerCase();

        target =
          all.find(
            (e) =>
              (dtId && (e.id.toLowerCase() === dtId || String((e as any)._id).toLowerCase() === dtId)) ||
              (dtCode && e.code && e.code.toLowerCase() === dtCode) ||
              (dtTitle && e.title && e.title.toLowerCase() === dtTitle) ||
              (dtTitle && e.title && e.title.toLowerCase().includes(dtTitle))
          ) || null;

        if (!target) {
          target = {
            id: activeTest.testId || activeTest.code || activeTest.testTitle || 'exam-unknown',
            code: activeTest.code || 'TEST',
            title: activeTest.testTitle || activeTest.code || 'Examination',
            description: '',
            category: activeTest.testType === 'practice' ? 'Practice' : 'Mock Examination',
            durationMinutes: activeTest.durationMinutes || 60,
            totalMarks: activeTest.totalMarks || 100,
            negativeMarking:
              activeTest.testType === 'practice'
                ? 'No negative marking (Practice)'
                : '0.50 marks per incorrect response',
            difficulty: 'Moderate',
            sections: [],
            questions: [],
            questionCount: 0,
          };
        }
      } else {
        target = matchedRequestedExam || (all.length > 0 ? all[0] : null);
      }

      if (!target) {
        return {
          success: false,
          intent: 'START_EXAM',
          userQuery: rawQuery,
          assistantReply: isHindi ? 'कोई परीक्षा उपलब्ध नहीं है।' : 'No examinations are available right now.',
          actionExecuted: 'No Exam Available',
        };
      }

      // Close notifications panel/detail if open
      if (notifStore.isOpen || notifStore.activeNotification) {
        notifStore.toggleOpen(false);
        notifStore.closeNotificationDetail();
      }

      // If user is on /admin route, ensure we navigate back to main student app
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }

      // The confirmation reply spoken just below stands in for the store's own
      // "Starting…" announcement, which would otherwise cut it off.
      const isPracticeMode =
        (activeTest && activeTest.testType === 'practice') ||
        target.id.includes('drill') ||
        target.id.includes('practice') ||
        (target.code && (target.code.startsWith('PRACTICE-') || target.code.includes('PO-02'))) ||
        target.negativeMarking === 'No negative marking (Practice)';

      const launchId = activeTest?.testId || target?.id || activeTest?.code || activeTest?.testTitle || '';
      void examStore.selectExam(
        launchId,
        isPracticeMode ? 'practice' : 'exam',
        {
          announce: false,
          testDetails: activeTest || null,
        }
      );
      soundEffects.playSuccess();
      actionExecuted = `Started ${target.title}`;

      // Build a clear confirmation reply telling user exactly what opened + Q1 info
      const confirmReply = isHindi
        ? `"${target.title}" सफलतापूर्वक शुरू हो गया है! प्रश्न 1 आपकी स्क्रीन पर लोड हो चुका है। पूरा प्रश्न और विकल्प सुनने के लिए "प्रश्न पढ़ो" बोलें।`
        : `"${target.title}" has been opened successfully! Question 1 is now loaded on your screen. Say "Read question" to hear the full question and options.`;

      // Vocalize the confirmation reply
      useAnnouncerStore.getState().announce(confirmReply, 'assertive', true);

      return {
        success: true,
        intent: 'START_EXAM',
        userQuery: rawQuery,
        assistantReply: confirmReply,
        actionExecuted,
      };
    }

    switch (actionUpper) {
      case 'SELECT_OPTION':
      case 'CHOOSE_OPTION':
      case 'OPTION_SELECT': {
        const opt = Number(parsed.param) || (queryLower.includes('2') ? 2 : queryLower.includes('3') ? 3 : queryLower.includes('4') ? 4 : 1);
        if (context.activeView === 'exam') {
          // This reply is the only voice for the action — the store's own
          // announcement is stood down, because the second message would cancel
          // the first before the candidate heard which option was taken.
          examStore.selectOption(opt, { announce: false });
          soundEffects.playSelect();
          const { questions, currentIndex, selectedOptions } = useExamStore.getState();
          const total = questions.length;
          const isLastQuestion = currentIndex >= total - 1;
          const allAnswered = Object.keys(selectedOptions).length >= total;
          const selection = describeOptionSelection(questions[currentIndex], opt);

          let guidance = isHindi
            ? ' आगे बढ़ने के लिए "अगला प्रश्न" बोलें, या फिर से सुनने के लिए "प्रश्न पढ़ो" कहें।'
            : ' Say "Next question" to continue, or "Read question" to review.';
          if (!isHindi) {
            if (allAnswered) {
              guidance = ` All ${total} questions have been answered. Say "Submit exam" to finish and submit your test, or "Read question" to review.`;
            } else if (isLastQuestion) {
              guidance = ` This is the last question (${total} of ${total}). Say "Submit exam" to finish and submit your test, or "Previous question" or "Read question" to review.`;
            }
          }

          spokenReply = `${selection}${guidance}`;
        }
        break;
      }
      case 'CLEAR_OPTION':
      case 'CLEAR':
      case 'DESELECT': {
        if (context.activeView === 'exam') {
          const state = useExamStore.getState();
          const q = state.questions[state.currentIndex];
          const hadSelection = Boolean(q && state.selectedOptions[q.id]);
          examStore.clearOption({ announce: false });
          soundEffects.playClear();
          actionExecuted = hadSelection ? 'Cleared Option' : 'Nothing selected to clear';
          spokenReply = describeClearSelection(q, hadSelection);
        }
        break;
      }
      case 'NEXT_QUESTION':
      case 'NEXT': {
        if (context.activeView === 'exam') {
          const { questions, currentIndex, selectedOptions } = useExamStore.getState();
          const total = questions.length;
          const isAtLast = currentIndex >= total - 1;
          const answeredCount = Object.keys(selectedOptions).length;

          if (isAtLast) {
            soundEffects.playTimerAlert();
            actionExecuted = 'At Last Question - Ready to Submit';
            spokenReply = isHindi
              ? 'आप पहले से ही अंतिम प्रश्न पर हैं। परीक्षा समाप्त करने के लिए "सबमिट एग्जाम" बोलें।'
              : (answeredCount >= total
                  ? `You have reached the end of the test. All ${total} questions have been answered. Say "Submit exam" to finish and submit your test, or "Previous question" to review.`
                  : `You are on the last question (${total} of ${total}). ${total - answeredCount} questions remain unattempted. Say "Submit exam" to submit your test, or "Previous question" to review.`);
          } else {
            examStore.nextQuestion({ announce: false });
            actionExecuted = 'Moved to Next Question';
            const nextCtx = getAssistantContext();
            const q = nextCtx.currentQuestion;
            if (q) {
              spokenReply = buildFullQuestionSpeech(q);
            } else {
              spokenReply = isHindi
                ? 'आप पहले से ही अंतिम प्रश्न पर हैं। परीक्षा समाप्त करने के लिए "सबमिट एग्जाम" बोलें।'
                : 'You have reached the end of the test. Say "Submit exam" when you are ready to finish.';
            }
          }
        }
        break;
      }
      case 'PREVIOUS_QUESTION':
      case 'PREV':
      case 'PREVIOUS': {
        if (context.activeView === 'exam') {
          examStore.previousQuestion({ announce: false });
          actionExecuted = 'Moved to Previous Question';
          const prevCtx = getAssistantContext();
          const q = prevCtx.currentQuestion;
          if (q) {
            spokenReply = buildFullQuestionSpeech(q);
          } else {
            spokenReply = isHindi
              ? 'आप पहले से ही पहले प्रश्न पर हैं।'
              : 'You are already on the first question.';
          }
        }
        break;
      }
      case 'JUMP_QUESTION': {
        const qNum = Number(parsed.param);
        if (context.activeView === 'exam' && qNum > 0 && qNum <= examStore.questions.length) {
          examStore.jumpToQuestion(qNum - 1, { announce: false });
          actionExecuted = `Jumped to Question ${qNum}`;
          const jumpCtx = getAssistantContext();
          const q = jumpCtx.currentQuestion;
          if (q) {
            spokenReply = buildFullQuestionSpeech(q);
          }
        }
        break;
      }
      case 'MARK_REVIEW':
      case 'MARK': {
        if (context.activeView === 'exam') {
          examStore.toggleMarkForReview();
          soundEffects.playMark();
          actionExecuted = 'Toggled Mark for Review';
        }
        break;
      }
      case 'READ_QUESTION': {
        if (context.activeView === 'exam') {
          actionExecuted = 'Read Current Question';
          const curCtx = getAssistantContext();
          const q = curCtx.currentQuestion;
          if (q) {
            spokenReply = buildFullQuestionSpeech(q);
          }
        }
        break;
      }
      case 'CHECK_TIMER':
      case 'TIMER': {
        if (context.activeView === 'exam') {
          examStore.readTimer();
          actionExecuted = 'Announced Remaining Time';
        }
        break;
      }
      case 'EXPLAIN_DIAGRAM':
      case 'DIAGRAM': {
        if (context.activeView === 'exam') {
          window.dispatchEvent(new CustomEvent('dristix:open-diagram-explainer'));
          actionExecuted = 'Opened AI Diagram Explainer';
          const q = examStore.questions[examStore.currentIndex];
          if (q) {
            if (q.diagramAiExplanation?.audioNarration) {
              spokenReply = q.diagramAiExplanation.audioNarration;
            } else if (q.diagramDescription) {
              spokenReply = `Question ${q.questionNumber} diagram: ${q.diagramDescription}. Opening AI Diagram Explainer.`;
            } else if (q.diagramUrl) {
              spokenReply = `Opening AI Diagram Explainer for Question ${q.questionNumber}. Analyzing visual elements now.`;
            } else {
              spokenReply = `Question ${q.questionNumber} does not have an attached diagram or visual chart.`;
            }
          }
        }
        break;
      }
      case 'QUESTION_PALETTE':
      case 'PALETTE':
      case 'PALETTE_STATUS':
      case 'QUESTION_STATUS': {
        if (context.activeView === 'exam' && examStore.questions.length > 0) {
          const { questions, selectedOptions, markedForReview, currentIndex } = examStore;
          const total = questions.length;
          const answeredCount = Object.keys(selectedOptions).length;
          const markedCount = Object.keys(markedForReview).filter((id) => markedForReview[id]).length;
          const leftCount = total - answeredCount;

          const shouldOpenModal =
            queryLower.includes('open') ||
            queryLower.includes('kholo') ||
            queryLower.includes('dikhao') ||
            queryLower.includes('show') ||
            queryLower.includes('full');

          if (shouldOpenModal && !examStore.isPaletteOpen) {
            examStore.setPaletteOpen(true);
          }

          spokenReply = isHindi
            ? `प्रश्न पैलेट सारांश: कुल ${total} प्रश्न हैं। ${answeredCount} के उत्तर दिए, ${markedCount} समीक्षा के लिए चिह्नित हैं, ${leftCount} शेष हैं। आप अभी प्रश्न ${currentIndex + 1} पर हैं।`
            : `Question Palette summary: Total ${total} questions. ${answeredCount} answered, ${markedCount} marked for review, ${leftCount} left. You are currently on Question ${currentIndex + 1}.`;
          actionExecuted = shouldOpenModal ? 'Opened Question Palette' : 'Announced Question Palette Summary';
        }
        break;
      }
      case 'SUBMIT_EXAM':
      case 'FINAL_SUBMIT':
      case 'SUBMIT': {
        if (context.activeView === 'exam' && !examStore.isSubmitted) {
          if (examStore.isSubmitModalOpen) {
            examStore.setSubmitModalOpen(false);
            soundEffects.playSuccess();
            void examStore.submitExam();
            actionExecuted = 'Final Submitted Exam';
            spokenReply = isHindi
              ? 'परीक्षा सफलतापूर्वक सबमिट हो गई है! आपका प्रदर्शन रिपोर्ट लोड हो रहा है।'
              : 'Final submission confirmed! Submitting your examination now...';
          } else {
            examStore.setSubmitModalOpen(true);
            soundEffects.playTimerAlert();
            actionExecuted = 'Opened Submit Confirmation';
            const total = examStore.questions.length;
            const answered = Object.keys(examStore.selectedOptions).length;
            spokenReply = isHindi
              ? 'परीक्षा सबमिट करने की पुष्टि विंडो खुल गई है। टेस्ट पूरा करने के लिए "हाँ, सबमिट करो" बोलें, या वापस जाने के लिए "कैंसल" बोलें।'
              : `Confirm exam submission window is open. You have answered ${answered} of ${total} questions. Say "Yes, Final Submit" or press Enter to submit, or say "Continue to Exam" or press Escape to resume your test.`;
          }
        }
        break;
      }
      case 'FINAL_SUBMIT':
      case 'CONFIRM_SUBMIT': {
        if (context.activeView === 'exam' && !examStore.isSubmitted) {
          examStore.setSubmitModalOpen(false);
          soundEffects.playSuccess();
          void examStore.submitExam();
          actionExecuted = 'Final Submitted Exam';
          spokenReply = isHindi
            ? 'परीक्षा सफलतापूर्वक सबमिट हो गई है! आपका प्रदर्शन रिपोर्ट लोड हो रहा है।'
            : 'Final submission confirmed. Submitting your examination now...';
        }
        break;
      }
      case 'CONTINUE_EXAM':
      case 'RESUME_EXAM':
      case 'CANCEL_SUBMIT':
      case 'CANCEL': {
        if (context.activeView === 'exam') {
          const wasModalOpen = examStore.isSubmitModalOpen;
          examStore.setSubmitModalOpen(false);
          soundEffects.playSelect();
          actionExecuted = 'Resumed Exam (Cancelled Submission)';
          const q = context.currentQuestion;
          const qNum = q?.number || (examStore.currentIndex + 1);
          spokenReply = isHindi
            ? `सबमिशन रद्द कर दिया गया। प्रश्न ${qNum} पर वापस आ गए हैं। अब आप आगे के उत्तर दे सकते हैं।`
            : (wasModalOpen
                ? `Submission cancelled. Resuming exam at Question ${qNum}. You can say "Read question", "Next question", or select an option.`
                : `You are continuing your active exam on Question ${qNum}. Say "Read question" to hear the question.`);
        }
        break;
      }
      case 'READ_REPORT_SUMMARY':
      case 'SUMMARY': {
        const rep = context.diagnosticReport;
        const sum = rep?.verbalSummary?.join(' ') || (isHindi ? `आपका स्कोर 20 में से ${rep?.totalScore || 0} रहा।` : `Your score was ${rep?.totalScore || 0} out of ${rep?.maxScore || 20}.`);
        const reply = isHindi ? `"${rep?.examTitle || 'परीक्षा'}" का डायग्नोस्टिक सारांश: ${sum}` : `Diagnostic Summary for ${rep?.examTitle || 'Exam'}: ${sum}`;
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'READ_REPORT_SUMMARY',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Read Diagnostic Summary',
        };
      }
      case 'RETAKE_EXAM':
      case 'RETAKE': {
        examStore.resetExam();
        const reply = isHindi
          ? 'परीक्षा रीसेट हो गई है। प्रश्न 1 आपकी स्क्रीन पर लोड हो चुका है। शुरू करने के लिए "प्रश्न पढ़ो" बोलें।'
          : 'Exam has been reset. Question 1 is now loaded on your screen. Say "Read question" to begin.';
        useAnnouncerStore.getState().announce(reply, 'assertive', true);
        return {
          success: true,
          intent: 'RETAKE_EXAM',
          userQuery: rawQuery,
          assistantReply: reply,
          actionExecuted: 'Retook Exam',
        };
      }
      case 'ANALYTICS':
      case 'VIEW_ANALYTICS': {
        if (context.activeView !== 'analytics') {
          examStore.openAnalytics();
          actionExecuted = 'Opened Analytics';
        } else {
          actionExecuted = 'Read Analytics Summary';
        }
        const a = context.analytics;
        const total = a?.totalTests ?? context.totalSubmissions;
        const timed = a?.timedExamsCount ?? 0;
        const drills = a?.drillsCount ?? 0;
        const bestPct = a?.bestScorePercentage ?? context.bestScorePercentage;
        const bestTitle = a?.bestScoreTitle ?? context.bestScoreTitle;
        const bestMarks = a?.bestScoreMarks ?? '';
        const avgAcc = a?.averageAccuracy ?? context.averageAccuracy;
        const qSolved = a?.questionsSolved ?? 0;
        const corr = a?.correctCount ?? 0;
        const wrong = a?.wrongCount ?? 0;
        const latest = a?.recentSubmissions?.[0];
        const latestDetails = latest
          ? ` Latest test was "${latest.examTitle}" on ${latest.date}, scored ${latest.score} out of ${latest.maxScore} points with ${latest.percentage}% accuracy.`
          : '';
        spokenReply = isHindi
          ? `${context.studentName} का परफॉर्मेंस सारांश: कुल ${total} टेस्ट दिए (${timed} समयबद्ध मॉक टेस्ट, ${drills} प्रैक्टिस ड्रिल)। सर्वश्रेष्ठ स्कोर: "${bestTitle}" में ${bestPct}% (${bestMarks} अंक)। औसत सटीकता: ${avgAcc}%। कुल हल किए गए प्रश्न: ${qSolved} (${corr} सही, ${wrong} गलत)।${latest ? ` हालिया टेस्ट "${latest.examTitle}" था जिसमें ${latest.score} अंक और ${latest.percentage}% सटीकता रही।` : ''}`
          : `Performance summary for ${context.studentName}: Tests completed: ${total} total (${timed} timed exams, ${drills} practice drills). Best score: ${bestPct} percent (${bestMarks} points) in "${bestTitle}". Average accuracy: ${avgAcc} percent. Questions solved: ${qSolved} total (${corr} correct, ${wrong} wrong).${latestDetails}`;
        break;
      }
      case 'WHERE_AM_I':
      case 'PAGE_INFO':
      case 'EXPLAIN_PAGE': {
        soundEffects.playSelect();
        let whereReply = parsed.reply;
        if (context.activeView === 'report') {
          const rep = context.diagnosticReport;
          const examTitle = rep?.examTitle || context.currentExam?.title || 'Mock Examination';
          whereReply = isHindi
            ? `आपने "${examTitle}" सफलतापूर्वक पूरी करके सबमिट कर दी है। आप अभी परफॉर्मेंस रिपोर्ट और स्कोर विश्लेषण स्क्रीन पर हैं। आपका स्कोर ${rep?.totalScore || 0} / ${rep?.maxScore || 20} (${rep?.scorePercentage || 0}%) है। आप "समरी पढ़ो", "दोबारा टेस्ट दो", या "मॉक टेस्ट पेज पर जाओ" बोल सकते हैं।`
            : `You have completed and submitted "${examTitle}". You are currently on the Performance Diagnostic Report and Score Analysis screen. Your score is ${rep?.totalScore || 0} out of ${rep?.maxScore || 20} (${rep?.scorePercentage || 0}%). You can say "Read summary", "Retake test", or "Go to mock test page".`;
        } else if (context.activeView === 'analytics') {
          const a = context.analytics;
          const total = a?.totalTests ?? context.totalSubmissions;
          const timed = a?.timedExamsCount ?? 0;
          const drills = a?.drillsCount ?? 0;
          const bestPct = a?.bestScorePercentage ?? context.bestScorePercentage;
          const bestTitle = a?.bestScoreTitle ?? context.bestScoreTitle;
          const bestMarks = a?.bestScoreMarks ?? '';
          const avgAcc = a?.averageAccuracy ?? context.averageAccuracy;
          const qSolved = a?.questionsSolved ?? 0;
          const corr = a?.correctCount ?? 0;
          const wrong = a?.wrongCount ?? 0;
          whereReply = isHindi
            ? `आप अपने परफॉर्मेंस और स्कोर एनालिटिक्स डैशबोर्ड पर हैं। कुल ${total} टेस्ट दिए हैं (${timed} समयबद्ध टेस्ट, ${drills} प्रैक्टिस ड्रिल)। सर्वश्रेष्ठ स्कोर: "${bestTitle}" में ${bestPct}% (${bestMarks} अंक)। औसत सटीकता: ${avgAcc}%। कुल हल प्रश्न: ${qSolved} (${corr} सही, ${wrong} गलत)। आप "समरी सुनो", "हिस्ट्री बताओ" या "टेस्ट पेज पर जाओ" बोल सकते हैं।`
            : `You are on your Performance & Score Analytics Dashboard. Real data recorded: ${total} tests completed (${timed} timed exams, ${drills} practice drills). Best score: ${bestPct}% (${bestMarks} points) in "${bestTitle}". Average accuracy: ${avgAcc}%. Questions solved: ${qSolved} (${corr} correct, ${wrong} wrong). Say "Listen to summary", "History batao", or "Back to tests".`;
        }
        useAnnouncerStore.getState().announce(whereReply, 'assertive', true);
        return {
          success: true,
          intent: 'WHERE_AM_I',
          userQuery: rawQuery,
          assistantReply: whereReply,
          actionExecuted: 'Explained Current Screen',
        };
      }
      default: {
        soundEffects.playSelect();
        break;
      }
    }

    // Vocalize assistant reply
    useAnnouncerStore.getState().announce(spokenReply, 'assertive', true);

    return {
      success: true,
      intent: parsed.action,
      userQuery: rawQuery,
      assistantReply: spokenReply,
      actionExecuted,
    };
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string)?.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const geminiVoiceService = new GeminiVoiceService();
