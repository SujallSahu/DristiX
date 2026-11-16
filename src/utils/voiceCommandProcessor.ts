import { getAssistantContext } from './assistantContext';
import { useExamStore } from '../store/useExamStore';
import { useAnnouncerStore } from '../store/useAnnouncerStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import type { TextScale } from '../store/usePreferencesStore';
import { soundEffects } from './soundEffects';
import { verbalizeMath, verbalizeForSpeech } from './mathVerbalizer';
import { describeOptionSelection, describeClearSelection } from './optionSpeech';
import { matchExamFromQuery } from './examMatcher';
import { isPracticeTabNavigation } from './practiceTabNavigation';
import { SonificationEngine } from '../accessibility/sonification/SonificationEngine';
import { speechEngine } from './speechEngine';
import { isHindiPreferred, voiceRecognition } from './voiceRecognition';
import { useNotificationStore, resolveNotificationTestDetails } from '../store/useNotificationStore';
import { useAuthStore } from '../store/useAuthStore';
import { performScroll } from './scrollHelper';
import { explainEquation, explainGraph, explainDiagram } from './visualMathExplainer';
import type { Exam } from '../../shared/types';

export interface CommandProcessResult {
  success: boolean;
  intent: string;
  userQuery: string;
  assistantReply: string;
  actionExecuted?: string;
}

/**
 * Common phantom speech recognition hallucination tokens (e.g., produced by Whisper / Web Speech API on near-silent background audio)
 */
export const PHANTOM_NOISE_TOKENS = new Set([
  'so',
  'sau',
  'sou',
  'sow',
  'su',
  'सौ',
  'सो',
  'you',
  'the',
  'a',
  'an',
  'um',
  'uh',
  'ah',
  'hmm',
  'oh',
  'huh',
  'shh',
  'पूल',
  'पुल',
  'pool',
]);

/**
 * Detects whether an incoming user transcript is an intentional exam or navigation command.
 * Intentional commands must never be filtered out as phantom noise, acoustic echo, or ambient speech.
 */
export function isIntentionalVoiceCommand(text: string): boolean {
  if (!text) return false;
  const raw = text.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const norm = lower.replace(/[^\w\s\u0900-\u097F]/gi, '').trim();

  // 1. Greetings, Identity, Courtesies & Notifications
  if (
    /^(?:hello|hi|hey|hlo|namaste|नमस्ते|हेलो|हाय|who\s+are\s+you|aap\s+kaun\s+ho|tum\s+kaun\s+ho|आप\s+कौन\s+हो)$/i.test(norm) ||
    /^(?:thank\s+you|thanks|dhanyawad|dhanyavaad|धन्यवाद|shukriya|शुक्रिया|bye|goodbye|alvida|अलविदा|ok|okay)$/i.test(norm) ||
    /^(?:what\s+can\s+you\s+do|kya\s+kar\s+sakte\s+ho|help|madad|मदद|sahayata|सहायता|suggestions?|sujhav|सुझाव|guide)$/i.test(norm) ||
    /^(?:notifications?|notifs?|नोटिफिकेशन|सूचनाएं?)$/i.test(norm) ||
    /(?:open|show|read|check|close|dismiss|clear)\s+(?:notifications?|notifs?|नोटिफिकेशन|सूचना)/i.test(norm) ||
    /(?:नोटिफिकेशन|सूचना)\s*(?:पढ़ो|पढ़ो|खोलो|दिखाओ|बंद|हटाओ)/i.test(norm)
  ) {
    return true;
  }

  // If submit confirmation modal is currently open, confirm/resume responses are active
  const examStoreState = useExamStore.getState();
  if (examStoreState.isSubmitModalOpen) {
    if (
      /^(?:yes[, ]+final\s+submit|yes\s+final\s+submit|final\s+submit|yes\s+submit|confirm\s+submit|submit\s+final|yes|haan|ha|confirm|submit|submit\s+exam|submit\s+test|finish|finish\s+exam|jama\s*karo|enter)$/i.test(lower) ||
      /^(?:continue\s+to\s+exam|continue\s+the\s+exam|continue\s+exam|continue\s+test|continue|resume\s+exam|resume\s+the\s+exam|resume\s+test|resume|return\s+to\s+exam|back\s+to\s+exam|go\s+back\s+to\s+exam|cancel\s+submit|cancel\s+submission|cancel|no|nahi|nahin|wapas|ruk|ruko|stop|mat\s*karo|escape|esc)$/i.test(lower)
    ) {
      return true;
    }
  }

  // Submit modal explicit commands (active anywhere in exam)
  if (
    /^(?:yes[, ]+final\s+submit|yes\s+final\s+submit|final\s+submit|yes\s+submit|confirm\s+submit|submit\s+final|confirm\s+submission|final\s+submission|yes\s+submit\s+exam|yes\s+submit\s+the\s+exam|yes\s+final)$/i.test(lower) ||
    /^(?:continue\s+to\s+exam|continue\s+the\s+exam|continue\s+exam|continue\s+test|continue|resume\s+exam|resume\s+the\s+exam|resume\s+test|resume|return\s+to\s+exam|back\s+to\s+exam|cancel\s+submit|cancel\s+submission|cancel)$/i.test(lower)
  ) {
    return true;
  }

  // Diagnostic and Analytics Report commands
  if (
    /^(?:summary|read\s+summary|score|result|analytics|report|read\s+report|performance|explain\s+result|explain\s+report|explain\s+analytics|result\s+batao|analytics\s+batao|retake|retake\s+exam|retake\s+test|dobara|again)$/i.test(norm) ||
    norm.includes('result') ||
    norm.includes('analytics') ||
    norm.includes('summary') ||
    norm.includes('score') ||
    norm.includes('performance')
  ) {
    return true;
  }

  // Exam launch, catalog listing & tab navigation
  if (
    /(?:start|take|shuru|chalu|begin|launch|open)\s+(?:test|exam|mock|drill|pariksha)/i.test(norm) ||
    /^(?:start|take\s+test|start\s+test|start\s+exam|shuru\s+karo|test\s+shuru)$/i.test(norm) ||
    /(?:list|available|show|kaun\s+se|kitne)\s+(?:exams?|tests?|mocks?|drills?)/i.test(norm) ||
    norm.includes('practice arena') ||
    /^(?:mock\s+tests?|mock\s+exams?)$/i.test(norm) ||
    norm.includes('ssc cgl') ||
    norm.includes('ibps') ||
    norm.includes('rrb') ||
    norm.includes('upsc')
  ) {
    return true;
  }

  // General exam and navigation commands
  if (
    /^(?:next|next\s+question|agla\s+sawal|aage|previous|prev|previous\s+question|pichhla\s+sawal|read\s+question|repeat\s+question|sawal\s+padho|clear\s+option|unselect|check\s+timer|time\s+remaining|time\s+left|samay\s+batao|kitna\s+time|submit\s+exam|finish\s+exam|stop|ruko|pause|chup)$/i.test(norm) ||
    /^(?:option|select\s+option|vikalp|choice)\s+[1-4a-d]$/i.test(norm) ||
    norm.includes('diagram') ||
    norm.includes('chart') ||
    norm.includes('graph') ||
    norm.includes('quadratic') ||
    norm.includes('equation') ||
    norm.includes('formula') ||
    norm.includes('समीकरण') ||
    norm.includes('द्विघात') ||
    norm.includes('ग्राफ') ||
    norm.includes('चार्ट') ||
    norm.includes('आरेख') ||
    norm.includes('चित्र') ||
    norm.includes('hint') ||
    norm.includes('solution') ||
    norm.includes('formula') ||
    norm.includes('palette') ||
    norm.includes('settings') ||
    norm.includes('shortcuts') ||
    norm.includes('accessibility') ||
    norm.includes('theme') ||
    norm.includes('font size') ||
    norm.includes('scroll') ||
    norm.includes('स्क्रॉल') ||
    /^(?:page\s+up|page\s+down|scroll\s+up|scroll\s+down|upar\s+scroll|neeche\s+scroll)$/i.test(norm)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether an incoming transcript is a phantom noise hallucination, acoustic artifact, or meaningless ambient sound.
 */
export function isPhantomNoise(text: string): boolean {
  if (!text) return true;
  const raw = text.trim();
  if (!raw) return true;

  // Never filter intentional commands as phantom noise!
  if (isIntentionalVoiceCommand(raw)) return false;

  // Single punctuation/symbol characters or whitespace
  if (/^[\s.,!?;:_\-*#~♪♫()[\]]+$/.test(raw)) return true;

  // Audio/subtitle bracket tags: [music], (applause), etc.
  if (/^[[(<*].*[\])>*]$/.test(raw)) return true;

  const cleaned = raw
    .toLowerCase()
    .replace(/^[.,?!:;\s]+|[.,?!:;\s]+$/g, '')
    .trim();

  if (!cleaned) return true;
  if (cleaned.length <= 1) return true;
  if (PHANTOM_NOISE_TOKENS.has(cleaned)) return true;

  // Filter foreign script hallucinations (Korean, Chinese, Japanese, Cyrillic, Thai, etc.)
  // Produced by Whisper model when capturing low-level ambient room noise or mic hiss.
  if (/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff\u0e00-\u0e7f]/.test(cleaned)) {
    return true;
  }

  // Common Whisper video outro / channel / subscription hallucination patterns
  if (
    /^(?:thank you|thanks)\s+(?:for watching|for listening|everyone)[.!]?$/i.test(cleaned) ||
    /^(?:please\s+)?(?:subscribe|like and subscribe)(?:\s+to\s+(?:my|the|this)?\s*channel)?[.!]?$/i.test(cleaned) ||
    /^(?:see you)\s+(?:next time|in the next video|soon|later)[.!]?$/i.test(cleaned) ||
    /^(?:subtitles?(\s+by)?|transcribed by|captioned by|translated by|amara\.org|dotsub|opensubtitles)[.!]?$/i.test(cleaned) ||
    /^(?:देखने के लिए धन्यवाद|सब्सक्राइब करें|लाइक करें|शुभ रात्रि)[.!]?$/i.test(cleaned)
  ) {
    return true;
  }

  // Repeating single/pair word hallucination loops (e.g. "you you you", "thank you thank you", "सारी सारी")
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const unique = new Set(words);
    if (unique.size === 1) return true;
    if (words.length >= 4 && unique.size <= 2) return true;
    if (words.length >= 4 && words.length % 2 === 0) {
      const pair = `${words[0]} ${words[1]}`;
      const isRepeatedPair = words.every((w, i) => w === words[i % 2]);
      if (isRepeatedPair && pair.length <= 12) return true;
    }
  }

  return false;
}

/**
 * Generates the complete spoken text for a question, including its mathematical formulas,
 * all answer options verbalized naturally, and current selection status.
 */
export function buildFullQuestionSpeech(
  q: NonNullable<ReturnType<typeof getAssistantContext>['currentQuestion']>,
  prefix = ''
): string {
  const isHindi = isHindiPreferred();

  let formulaText = '';
  if (q.equationLatex) {
    const eq = explainEquation(q.equationLatex, isHindi, { isPractice: false, questionText: q.text });
    if (eq.isQuadratic) {
      formulaText = isHindi
        ? ` द्विघात समीकरण: ${verbalizeMath(q.equationLatex)}।`
        : ` Quadratic Equation: ${verbalizeMath(q.equationLatex)}.`;
    } else {
      formulaText = isHindi
        ? ` समीकरण: ${verbalizeMath(q.equationLatex)}।`
        : ` Equation: ${verbalizeMath(q.equationLatex)}.`;
    }
  }

  const diagramText = q.diagramAiExplanation?.audioNarration
    ? ` ${q.diagramAiExplanation.audioNarration}`
    : q.diagramDescription
    ? (isHindi ? ` विजुअल आरेख: ${verbalizeForSpeech(q.diagramDescription)}।` : ` Visual Diagram: ${verbalizeForSpeech(q.diagramDescription)}.`)
    : q.diagramUrl
    ? (isHindi ? ` इस प्रश्न में एक विजुअल आरेख शामिल है। विस्तृत विवरण के लिए "डायग्राम समझाओ" कहें।` : ` This question includes an attached visual diagram. Say "Explain diagram" to hear the full visual breakdown.`)
    : '';

  let graphText = '';
  if (q.graph && q.graph.enabled && q.graph.data?.length) {
    const gSummary = explainGraph(q.graph, isHindi);
    graphText = ` ${gSummary.summary}`;
  }
  const optionsText =
    q.options && q.options.length > 0
      ? (isHindi
          ? ` विकल्प हैं: ${q.options
              .map((o: any) => {
                const mathVerbal = o.mathLatex ? verbalizeMath(o.mathLatex).trim() : '';
                const rawText = o.text ? o.text.trim() : '';
                let optCombined = rawText;
                if (mathVerbal) {
                  const normRaw = rawText.toLowerCase().replace(/\s+/g, ' ');
                  const normMath = mathVerbal.toLowerCase().replace(/\s+/g, ' ');
                  if (normRaw && (normRaw.includes(normMath) || normMath.includes(normRaw))) {
                    optCombined = rawText || mathVerbal;
                  } else if (rawText) {
                    optCombined = `${rawText}, ${mathVerbal}`;
                  } else {
                    optCombined = mathVerbal;
                  }
                }
                return `विकल्प ${o.number}: ${verbalizeForSpeech(optCombined)}`;
              })
              .join('। ')}।`
          : ` The options are: ${q.options
              .map((o: any) => {
                const mathVerbal = o.mathLatex ? verbalizeMath(o.mathLatex).trim() : '';
                const rawText = o.text ? o.text.trim() : '';
                let optCombined = rawText;
                if (mathVerbal) {
                  const normRaw = rawText.toLowerCase().replace(/\s+/g, ' ');
                  const normMath = mathVerbal.toLowerCase().replace(/\s+/g, ' ');
                  if (normRaw && (normRaw.includes(normMath) || normMath.includes(normRaw))) {
                    optCombined = rawText || mathVerbal;
                  } else if (rawText) {
                    optCombined = `${rawText}, ${mathVerbal}`;
                  } else {
                    optCombined = mathVerbal;
                  }
                }
                return `Option ${o.number}: ${verbalizeForSpeech(optCombined)}`;
              })
              .join('. ')}.`)
      : '';
  const statusText = q.selectedOption
    ? (isHindi ? ` वर्तमान में चुना गया: विकल्प ${q.selectedOption}।` : ` Currently selected: Option ${q.selectedOption}.`)
    : (isHindi ? ' अभी तक कोई विकल्प नहीं चुना गया है।' : ' No option has been selected yet.');

  const leading = prefix ? `${prefix} ` : '';
  const qLabel = isHindi ? 'प्रश्न' : 'Question';
  return `${leading}${qLabel} ${q.number}: ${verbalizeForSpeech(q.text)}.${formulaText}${diagramText}${graphText}${optionsText}${statusText}`;
}

/**
 * High-Precision Multi-lingual Normalizer (Devanagari, Hindi, Hinglish & English)
 */
function normalizePhonetics(raw: string): string {
  let text = raw.toLowerCase().trim();

  // 1. Devanagari numerals to ASCII digits
  text = text
    .replace(/०/g, '0')
    .replace(/१/g, '1')
    .replace(/२/g, '2')
    .replace(/३/g, '3')
    .replace(/४/g, '4')
    .replace(/५/g, '5')
    .replace(/६/g, '6')
    .replace(/७/g, '7')
    .replace(/८/g, '8')
    .replace(/९/g, '9');

  // 2. Options and numbers (Devanagari + Hinglish + English + Phonetic STT Mishearings)
  // Catch Whisper STT hearing "option" as "ocean", "action", "auction", "often", "open", "caption", "choice", "opt"
  text = text.replace(
    /(?:ऑप्शन|विकल्प|ऑपशन|ऑप्सन|option|ocean|action|auction|often|open|caption|opt|choice|choice\s*number)\s*(?:नंबर|नम्बर|number)?\s*(1|एक|पहला|पहिला|फर्स्ट|ए\b|a\b|one|won|pehla|first)/gi,
    'option 1'
  );
  text = text.replace(/(?:first|pehla|ek|1st|1)\s*(?:option|choice|wala|number|chun|select|lagao|tick)/gi, 'option 1');
  text = text.replace(/(?:select|chuno|choose|answer|uttar|उत्तर|tick|lagao)\s*(?:option)?\s*(1|one|won|ek|pehla|\ba\b|first)/gi, 'option 1');
  text = text.replace(/\b(?:option\s*a|a\s*option|choice\s*a)\b/gi, 'option 1');

  // Option 2 (including "tu", "too", "doosra", "b", "choice b")
  text = text.replace(
    /(?:ऑप्शन|विकल्प|ऑपशन|ऑप्सन|option|ocean|action|auction|often|open|caption|opt|choice|choice\s*number)\s*(?:नंबर|नम्बर|number)?\s*(2|दो|दूसरा|दुसरा|सेकंड|बी\b|b\b|two|tu|too|doosra|dusra|second|\bdo\b)/gi,
    'option 2'
  );
  text = text.replace(/(?:second|dusra|doosra|do|2nd|2)\s*(?:option|choice|wala|number|chun|select|lagao|tick)/gi, 'option 2');
  text = text.replace(/(?:select|chuno|choose|answer|uttar|उत्तर|tick|lagao)\s*(?:option)?\s*(2|two|tu|too|do|dusra|doosra|\bb\b|second)/gi, 'option 2');
  text = text.replace(/\b(?:option\s*b|b\s*option|choice\s*b)\b/gi, 'option 2');

  // Option 3 (including "tree", "teesra", "c", "choice c")
  text = text.replace(
    /(?:ऑप्शन|विकल्प|ऑपशन|ऑप्सन|option|ocean|action|auction|often|open|caption|opt|choice|choice\s*number)\s*(?:नंबर|नम्बर|number)?\s*(3|तीन|तीसरा|थर्ड|सी\b|c\b|three|tree|teesra|teen|third)/gi,
    'option 3'
  );
  text = text.replace(/(?:third|teesra|teen|3rd|3)\s*(?:option|choice|wala|number|chun|select|lagao|tick)/gi, 'option 3');
  text = text.replace(/(?:select|chuno|choose|answer|uttar|उत्तर|tick|lagao)\s*(?:option)?\s*(3|three|tree|teen|teesra|\bc\b|third)/gi, 'option 3');
  text = text.replace(/\b(?:option\s*c|c\s*option|choice\s*c)\b/gi, 'option 3');

  // Option 4 (including "for", "chautha", "d", "choice d")
  text = text.replace(
    /(?:ऑप्शन|विकल्प|ऑपशन|ऑप्सन|option|ocean|action|auction|often|open|caption|opt|choice|choice\s*number)\s*(?:नंबर|नम्बर|number)?\s*(4|चार|चौथा|फोर्थ|डी\b|d\b|four|for|chautha|char|fourth)/gi,
    'option 4'
  );
  text = text.replace(/(?:fourth|chautha|char|4th|4)\s*(?:option|choice|wala|number|chun|select|lagao|tick)/gi, 'option 4');
  text = text.replace(/(?:select|chuno|choose|answer|uttar|उत्तर|tick|lagao)\s*(?:option)?\s*(4|four|for|char|chautha|\bd\b|fourth)/gi, 'option 4');
  text = text.replace(/\b(?:option\s*d|d\s*option|choice\s*d)\b/gi, 'option 4');

  // 3. Question & Reading (including common phonetic mishearings)
  text = text.replace(
    /(?:क्वेश्चन|क्वेशन|थेकेशन|क्वेशचन|कुएस्शन|कोशचन|कवैश्चन|सवाल|प्रश्न|सवाली|question|sawal|sawaal|prashna|pestan|pestin|pression)/gi,
    'question'
  );
  text = text.replace(
    /(?:पढ़कर\s*सुनाओ|प्रश्न\s*पढ़ो|सवाल\s*पढ़ो|read\s+question|read\s+problem|padho\s+question|sawal\s+padh)/gi,
    'read_question'
  );

  // 4. Navigation (handling "net", "neck", "nest" for next)
  text = text.replace(/(?:अगला|अगले|आगे|नेक्स्ट|next|agla|aage|net|neck|nest|forward|ahead)/gi, 'next');
  text = text.replace(/(?:पिछला|पिछले|पीछे|प्रीवियस|previous|prev|pichla|peechla|peeche|back\s*question)/gi, 'previous');

  // 5. Actions (Clear / Reset / Mark / Review)
  text = text.replace(/(?:चुनो|लगाओ|सेलेक्ट|टिक|क्लिक|select|choose|tick|chuno|lagao)/gi, 'select');
  text = text.replace(/(?:हटाओ|हटा\s*दो|हटाना|मिटाओ|क्लियर|अनचेक|clear|deselect|unselect|hatao|mitao|reset)/gi, 'clear');
  text = text.replace(/(?:मार्क|रिव्यू|रिवियु|mark|review|doubt|flag|star)/gi, 'mark');

  // 5b. Question Palette & Exam Progress
  text = text.replace(/(?:पैलेट|पैलट|पेलट|पैलिट|palette|palet|pallet|pelet)/gi, 'palette');
  text = text.replace(/(?:स्थिति|स्टेटस|हालत|प्रोग्रेस|status|progress)/gi, 'status');

  // 6. Time / Timer
  text = text.replace(/(?:टाइम|समय|वक्त|घड़ी|time|samay|waqt|timer|clock)/gi, 'time');

  // 7. Exam operations & Specific Exam Names
  text = text.replace(/(एसएससी|सीजीएल|staff\s*selection|ssc|cgl)/gi, 'ssc cgl');
  text = text.replace(/(आरआरबी|एनटीपीसी|रेलवे|rrb|ntpc|railways?)/gi, 'rrb ntpc');
  text = text.replace(/(आईबीपीएस|पीओ|ibps|po|bank|banking|बैंकिंग|बैंक)/gi, 'ibps po');
  text = text.replace(/(यूपीएससी|सीसैट|सिविल\s*सेवा|सिविल|सिविल्स|upsc|u\.p\.s\.c|u\s*p\s*s\s*c|up\s*sc|civil\s*services?|civil|csat|ias|ips|paper\s*2|paper\s*ii)/gi, 'upsc csat');
  // 7b. Practice drills & reading phonetic variations (e.g. reels, real, drils, thrills)
  text = text.replace(/\b(?:reels|reel|drils|dril|dills|dill|thrills|thrill)\b/gi, 'drill');
  text = text.replace(/(?:ड्रिल्स|ड्रिल|रील्स|रिल|रिल्स)/gi, 'drill');
  text = text.replace(/(?:प्रैक्टिस|अभ्यास|practice)/gi, 'practice');
  text = text.replace(/\b(?:real|reed|red)\s+(?:all\s+)?available\b/gi, 'read all available');
  text = text.replace(/\b(?:real|reed|red)\s+(?:all\s+)?practice\b/gi, 'read all practice');
  text = text.replace(/(शुरू|चालू|स्टार्ट|खोलो|start|open|shuru|chalao|kholo)/gi, 'start');
  text = text.replace(/(सबमिट|जमा|खत्म|submit|finish|khatam|jama)/gi, 'submit');
  text = text.replace(/(वापस|बैक|होम|back|return|home|wapas)/gi, 'back');

  // 8. Analytics & Scores (Devanagari, phonetic Hindi spellings, Hinglish & English)
  text = text.replace(
    /(एनालिटिक्स|एनलेटेक्स|एनलिटिक्स|अनैलिटिक्स|एनेलिटिक्स|एनालेटिक्स|परफॉर्मेंस|रिपोर्ट्स?|स्कोर|रिजल्ट|परिणाम|analytics|score|result|performance|reports?)/gi,
    'analytics'
  );

  // 8b. Explain Current Page / Location (Grounded Navigation Inquiries)
  text = text.replace(
    /(यह कौन सा पेज है|ये कौन सा पेज है|कौन सा पेज है|कौनसा पेज है|किस पेज पर हैं?|किस पेज पर|कहाँ हूँ|कहाँ पर हूँ|यह क्या है|ये क्या है|स्क्रीन समझाओ|पेज समझाओ|screen batao|page batao|explain page|which page|where am i|what page|kaun sa page|konsa page|kis page)/gi,
    'explain_page'
  );

  // 8c. Page Scrolling Commands
  text = text.replace(/(?:स्क्रॉल\s*(?:अप|ऊपर)|ऊपर\s*स्क्रॉल|ऊपर\s*करो|थोड़ा\s*ऊपर|थोड़ा\s*ऊपर|scroll\s*up(?:ward)?|page\s*up|upar\s*scroll|upar\s*karo|thoda\s*upar)/gi, 'scroll_up');
  text = text.replace(/(?:स्क्रॉल\s*(?:डाउन|नीचे)|नीचे\s*स्क्रॉल|नीचे\s*करो|थोड़ा\s*नीचे|थोड़ा\s*नीचे|scroll\s*down(?:ward)?|page\s*down|neeche\s*scroll|niche\s*scroll|neeche\s*karo|niche\s*karo|thoda\s*neeche)/gi, 'scroll_down');
  text = text.replace(/(?:टॉप\s*पर(?:\s*जाओ)?|सबसे\s*ऊपर|scroll\s*(?:to\s*)?top|page\s*top|go\s*to\s*top|sabse\s*upar)/gi, 'scroll_top');
  text = text.replace(/(?:बॉटम\s*पर(?:\s*जाओ)?|सबसे\s*नीचे|scroll\s*(?:to\s*)?bottom|page\s*bottom|go\s*to\s*bottom|sabse\s*neeche)/gi, 'scroll_bottom');

  // 9. Question Hints vs General Help / Suggestions
  text = text.replace(/(?:क्वेश्चन\s+का\s+हिंट|सवाल\s+का\s+हिंट|question\s+hint|give\s+hint|show\s+hint|tell\s+hint|\bhint\b|\bहिंट\b|\bसंकेत\b)/gi, 'hint');
  text = text.replace(/(?:मदद|सहायता|help|suggestions?|sujhav|सुझाव|guidance|guide|what\s+can\s+i\s+do|kya\s+karein|kya\s+karu|commands?)/gi, 'help_suggestions');
  // Normalize solution & solve requests (never convert explain/samjhao into solution!)
  text = text.replace(/(?:सॉल्यूशन|हल\b|उत्तर\s+बताओ|answer\s+batao|solve\s+this|solve\s+karo|\bsolve\b)/gi, 'solution');
  // Normalize explanation & query clarification requests
  text = text.replace(/(?:एक्सप्लेनेशन|समझाइए|समझाओ|समझा\s+दो|explain\s+query|query\s+explain|explain\s+question|question\s+explain|sawal\s+samjhao|explain\s+this|\bexplain\b|\bexplanation\b)/gi, 'explain_question');

  // 9b. Quadratic Equations & Math Formula Normalizations
  text = text.replace(/(?:द्विघात\s*समीकरण|quadratic\s*equation|quadratic\s*formula|quad\s*equation|quadratic)/gi, 'quadratic_equation');
  text = text.replace(/(?:समीकरण|फार्मूला|फॉर्मूला|समीकरन|सूत्र|equation|formula)/gi, 'equation');

  // 9c. Charts & Graphs Normalizations
  text = text.replace(/(?:बार\s*चार्ट|लाइन\s*ग्राफ|पाई\s*चार्ट|ग्राफ|चार्ट|bar\s*chart|line\s*graph|pie\s*chart)/gi, 'graph');

  // 9d. Visual Diagrams Normalizations
  text = text.replace(/(?:विजुअल\s*आरेख|आरेख|चित्र|डायग्राम|diagram|figure)/gi, 'diagram');

  // 10. Exam lists / inquiries
  text = text.replace(/(मॉक\s*टेस्ट्स?|मॉकटेस्ट|mock\s*tests?|mocktest|moak\s*tests?|moaktest|moak|moke)/gi, 'mocktest');
  text = text.replace(
    /(कितने|कितना|कौन कौन से|कौन-कौन से|कौन-कौन|कौन से|क्या क्या|क्या-क्या|उपलब्ध|kaun kaun se|kon kon se|kaun kaun|kon kon|koun koun|kaun se|kon se|koun se|kya kya|kitne|kitna|list|lists|available|avalable|uplabdh|show\s*all)/gi,
    'list'
  );
  text = text.replace(/(एग्जाम्स?|परीक्षाएं|परीक्षा|टेस्ट्स?|examinations?|examination|exams?|tests?|pariksha)/gi, 'exam');

  return text;
}

/**
 * Execute command against a single normalized transcript
 */
function executeCommand(rawTranscript: string, shouldAnnounce = true): CommandProcessResult {
  if (isPhantomNoise(rawTranscript)) {
    return {
      success: false,
      intent: 'UNRECOGNIZED',
      userQuery: rawTranscript,
      assistantReply: '',
      actionExecuted: undefined,
    };
  }

  const normalized = normalizePhonetics(rawTranscript);
  const rawLower = rawTranscript.toLowerCase().trim();
  const context = getAssistantContext();
  const examStore = useExamStore.getState();

  const isHindi =
    context.voiceLanguageMode === 'hi-IN' ||
    context.isHindiMode ||
    voiceRecognition.isHindiMode() ||
    /[\u0900-\u097F]/.test(rawTranscript) ||
    (context.voiceLanguageMode !== 'en-US' && isHindiPreferred(rawTranscript));

  const makeReply = (
    intent: string,
    reply: string,
    actionExecuted?: string,
    success = true
  ): CommandProcessResult => {
    soundEffects.playSelect();
    if (shouldAnnounce) {
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
    }
    return {
      success,
      intent,
      userQuery: rawTranscript,
      assistantReply: reply,
      actionExecuted,
    };
  };

  // ==========================================
  // DIAGRAM & VISUAL CHART ACCESSIBILITY:
  // Strictly permitted during live exams / mock tests for visually impaired candidates
  // ==========================================
  const combinedText = `${rawLower} ${normalized}`;
  const isCloseDiagram =
    rawLower.includes('close diagram') ||
    rawLower.includes('hide diagram') ||
    rawLower.includes('diagram band') ||
    rawLower.includes('chart band') ||
    rawLower.includes('close chart') ||
    rawLower.includes('डायग्राम बंद');

  if (isCloseDiagram && context.activeView === 'exam') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dristix:close-diagram-explainer'));
    }
    const reply = isHindi
      ? 'डायग्राम विंडो बंद कर दी गई है। आप पुनः प्रश्न पर आ गए हैं।'
      : 'Diagram explainer closed. Returning to question view.';
    return makeReply('CLOSE_DIAGRAM', reply, 'Closed Visual Diagram Explainer');
  }

  // 1. MATHEMATICAL FORMULAS & QUADRATIC EQUATIONS
  const isEquationQuery =
    (combinedText.includes('quadratic_equation') ||
      /(?:quadratic|equation|formula|samiikaran|samikaran|formulae|समीकरण|द्विघात)\b/i.test(combinedText)) &&
    (/(?:explain|describe|read|what|tell|batao|samjhao|kya hai|detail|breakdown|guide|kaise)\b/i.test(combinedText) ||
      /^(?:explain\s+equation|explain\s+quadratic|quadratic\s+equation|equation|formula|samiikaran\s+samjhao|formula\s+samjhao)$/i.test(rawLower));

  if (isEquationQuery && context.activeView === 'exam') {
    const q = context.currentQuestion;
    if (q?.equationLatex) {
      const eqResult = explainEquation(q.equationLatex, isHindi, {
        isPractice: context.currentExam?.isPractice,
        questionText: q.text,
      });
      return makeReply('EXPLAIN_EQUATION', eqResult.speech, eqResult.isQuadratic ? 'Explained Quadratic Equation' : 'Explained Math Equation');
    } else {
      const reply = isHindi
        ? 'वर्तमान प्रश्न में कोई द्विघात या गणितीय समीकरण नहीं दिया गया है।'
        : 'There is no mathematical equation or quadratic formula attached to this question.';
      return makeReply('EXPLAIN_EQUATION', reply, 'No Equation Attached');
    }
  }

  // 2. CHARTS & DATA INTERPRETATION GRAPHS
  const isGraphQuery =
    /(?:graph|chart|plot|bar\s*chart|line\s*graph|pie\s*chart|ग्राफ|चार्ट)\b/i.test(combinedText) &&
    (/(?:explain|describe|read|bolo|sunao|what|tell|batao|samjhao|dekho|khol|open|show|dikhao|detail|breakdown|data|points)\b/i.test(combinedText) ||
      /^(?:explain\s+graph|explain\s+chart|graph\s+samjhao|chart\s+samjhao|graph\s+data|chart\s+data|graph|chart)$/i.test(rawLower));

  if (isGraphQuery && context.activeView === 'exam') {
    const q = context.currentQuestion;
    if (q?.graph && q.graph.enabled && q.graph.data?.length) {
      const gResult = explainGraph(q.graph, isHindi);
      return makeReply('EXPLAIN_GRAPH', gResult.speech, 'Explained Chart & Graph Data');
    } else if (q?.diagramAiExplanation || q?.diagramDescription || q?.diagramUrl) {
      const dResult = explainDiagram(q, isHindi);
      if (q.diagramUrl || q.diagramAiExplanation) {
        window.dispatchEvent(new CustomEvent('dristix:open-diagram-explainer'));
      }
      return makeReply('EXPLAIN_DIAGRAM', dResult.speech, 'Explained Visual Diagram');
    } else {
      const reply = isHindi
        ? 'वर्तमान प्रश्न में कोई डेटा ग्राफ या चार्ट संलग्न नहीं है।'
        : 'This question does not have an attached data chart or graph.';
      return makeReply('EXPLAIN_GRAPH', reply, 'No Graph Attached');
    }
  }

  // 3. VISUAL DIAGRAMS & GEOMETRY
  const isDiagramQuery =
    !isGraphQuery &&
    !isEquationQuery &&
    (/(?:diagram|figure|visual|image|chitra|aarekh|चित्र|आरेख|voice\s*guide|visual\s*guide)\b/i.test(combinedText) &&
      /(?:explain|describe|read|bolo|sunao|what|tell|batao|samjhao|dekho|khol|open|show|dikhao|detail|breakdown|guide)\b/i.test(combinedText) ||
      /^(?:explain\s+diagram|describe\s+diagram|read\s+diagram|diagram\s+explain|diagram\s+samjhao|diagram|figure)$/i.test(rawLower));

  if (isDiagramQuery && context.activeView === 'exam') {
    const q = context.currentQuestion;
    const dResult = explainDiagram(q || {}, isHindi);
    if (q?.diagramUrl || q?.diagramAiExplanation) {
      window.dispatchEvent(new CustomEvent('dristix:open-diagram-explainer'));
      void examStore.explainCurrentDiagram(true);
    }
    return makeReply('EXPLAIN_DIAGRAM', dResult.speech, 'Explained Visual Diagram');
  }

  // ==========================================
  // EXAM INTEGRITY GUARD:
  // Strictly prevent solving questions or revealing answers during live exam
  // ==========================================
  if (context.activeView === 'exam' && !isDiagramQuery && !isGraphQuery && !isEquationQuery) {
    const isExplainQuestion =
      normalized.includes('explain_question') ||
      normalized.includes('explain question') ||
      normalized.includes('explain query') ||
      normalized.includes('query explain') ||
      normalized.includes('explain this') ||
      normalized.includes('sawal samjhao') ||
      normalized.includes('question samjhao') ||
      normalized.includes('query samjhao') ||
      rawLower.includes('sawal samjhao') ||
      rawLower.includes('question samjhao') ||
      rawLower.includes('explain the question') ||
      rawLower.includes('explain this question') ||
      rawLower.includes('explain question') ||
      rawLower.includes('explain query') ||
      rawLower.includes('what is the question') ||
      rawLower.includes('kya puchha') ||
      rawLower.includes('samjhao') ||
      rawLower.includes('samjha do') ||
      rawLower.includes('samjhaiye') ||
      /^(?:explain|explain\s+this|explain\s+question|explain\s+query|sawal\s+samjhao|question\s+samjhao|samjhao|samjha\s+do)$/i.test(rawLower);

    if (isExplainQuestion && context.currentQuestion) {
      const q = context.currentQuestion;
      const speech = buildFullQuestionSpeech(q);
      const guidance = isHindi
        ? ' à¤‰à¤¤à¥à¤¤à¤° à¤šà¥à¤¨à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ "à¤µà¤¿à¤•à¤²à¥à¤ª 1 à¤¸à¥‡ 4" à¤¬à¥‹à¤²à¥‡à¤‚, à¤¯à¤¾ à¤†à¤—à¥‡ à¤¬à¤¢à¤¼à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ "à¤…à¤—à¤²à¤¾ à¤ªà¥à¤°à¤¶à¥à¤¨" à¤•à¤¹à¥‡à¤‚à¥¤'
        : ' Say "Option 1" through "Option 4" to select your choice, or "Next question" to proceed.';
      const reply = `${speech} ${guidance}`;
      return makeReply('EXPLAIN_QUESTION', reply, 'Explained Question and Options');
    }

    const isSolveOrAnswerRequest =
      !isExplainQuestion &&
      !isEquationQuery &&
      !isGraphQuery &&
      !isDiagramQuery &&
      (
        normalized.includes('solve') ||
        rawLower.includes('solve this') ||
        rawLower.includes('solve karo') ||
        rawLower.includes('hal karo') ||
        rawLower.includes('solution batao') ||
        rawLower.includes('answer batao') ||
        rawLower.includes('sahi option') ||
        rawLower.includes('sahi answer') ||
        rawLower.includes('correct answer') ||
        rawLower.includes('what is the answer') ||
        rawLower.includes('answer kya hai') ||
        rawLower.includes('uttar batao')
      );

    if (isSolveOrAnswerRequest) {
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'à¤ªà¤°à¥€à¤•à¥à¤·à¤¾ à¤•à¥‡ à¤¦à¥Œà¤°à¤¾à¤¨ à¤‰à¤¤à¥à¤¤à¤° à¤¬à¤¤à¤¾à¤¨à¤¾ à¤¯à¤¾ à¤¸à¤µà¤¾à¤² à¤¹à¤² à¤•à¤°à¤¨à¤¾ à¤µà¤°à¥à¤œà¤¿à¤¤ à¤¹à¥ˆà¥¤ à¤†à¤ª à¤®à¥à¤à¤¸à¥‡ à¤ªà¥à¤°à¤¶à¥à¤¨ à¤ªà¤¢à¤¼à¤¨à¥‡, à¤¸à¤µà¤¾à¤² à¤¸à¤®à¤à¤¾à¤¨à¥‡, à¤µà¤¿à¤•à¤²à¥à¤ª à¤šà¥à¤¨à¤¨à¥‡, à¤…à¤—à¤²à¤¾ à¤¸à¤µà¤¾à¤² à¤¦à¥‡à¤–à¤¨à¥‡ à¤¯à¤¾ à¤¶à¥‡à¤· à¤¸à¤®à¤¯ à¤ªà¥‚à¤›à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤•à¤¹ à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤'
        : 'Exam integrity mode is active. I cannot solve questions or reveal correct answers during the live test. You can ask me to read the question, explain the problem, select an option, or check the time.';
      useAnnouncerStore.getState().announce(reply, 'assertive', true);
      return {
        success: true,
        intent: 'EXAM_INTEGRITY_REFUSAL',
        userQuery: rawTranscript,
        assistantReply: reply,
        actionExecuted: 'Exam Integrity Protected (Answer Withheld)',
      };
    }
  }

  // ==========================================
  // EXAM SUBMIT CONFIRMATION & RESUME MODAL ACCESSIBILITY:
  // "Continue to Exam" (resumes test) & "Yes, Final Submit" (submits test)
  // Accessible via voice during the confirmation modal and throughout the exam
  // ==========================================
  const isContinueToExam =
    /^(?:continue\s+to\s+exam|continue\s+the\s+exam|continue\s+exam|continue\s+test|continue|resume\s+exam|resume\s+the\s+exam|resume\s+test|resume|return\s+to\s+exam|back\s+to\s+exam|go\s+back\s+to\s+exam|cancel\s+submit|cancel\s+submission|cancel|don'?t\s+submit|do\s+not\s+submit|no\s+submit|close\s+submit|close\s+modal|keep\s+testing|keep\s+writing)$/i.test(rawLower) ||
    /^(?:continue\s+to\s+exam|continue\s+exam|continue|resume\s+exam|resume|cancel\s+submit|cancel|back\s+to\s+exam|return\s+to\s+exam)$/i.test(normalized) ||
    /(?:continue\s+to\s+exam|resume\s+exam|return\s+to\s+exam|cancel\s+submit|cancel\s+submission|continue\s+the\s+exam|resume\s+the\s+exam)/i.test(rawLower) ||
    /(?:continue\s+to\s+exam|resume\s+exam|cancel\s+submit)/i.test(normalized) ||
    (examStore.isSubmitModalOpen && (
      /^(?:no|nahi|nahin|cancel|wapas|back|close|exit|ruk|ruko|stop|mat\s*karo|continue|resume|escape)$/i.test(rawLower) ||
      /^(?:no|nahi|nahin|cancel|back|continue|resume)$/i.test(normalized) ||
      /(?:continue|resume|wapas\s+exam|exam\s+jari|pariksha\s+jari|abhi\s+nahi)/i.test(rawLower)
    ));

  const isFinalSubmit =
    /^(?:yes[, ]+final\s+submit|yes\s+final\s+submit|final\s+submit|yes\s+submit|confirm\s+submit|submit\s+final|confirm\s+submission|final\s+submission|yes\s+submit\s+exam|yes\s+submit\s+the\s+exam|yes\s+final)$/i.test(rawLower) ||
    /(?:yes[, ]+final\s+submit|yes\s+final\s+submit|final\s+submit|confirm\s+submit|submit\s+final|confirm\s+submission|final\s+submission)/i.test(rawLower) ||
    /(?:yes[, ]+final\s+submit|final\s+submit|confirm\s+submit)/i.test(normalized) ||
    (examStore.isSubmitModalOpen && (
      /^(?:yes|haan|ha|confirm|submit|submit\s+exam|submit\s+test|finish|finish\s+exam|jama\s*karo|haan\s*submit|submit\s*karo|enter)$/i.test(rawLower) ||
      /^(?:yes|haan|ha|confirm|submit)$/i.test(normalized) ||
      /(?:final\s*submit|yes.*submit|submit.*final|confirm.*submit|jama\s*kar)/i.test(rawLower)
    ));

  if (isContinueToExam) {
    if (context.activeView === 'exam') {
      speechEngine.stop();
      const wasModalOpen = examStore.isSubmitModalOpen;
      examStore.setSubmitModalOpen(false);
      soundEffects.playSelect();
      const q = context.currentQuestion;
      const qNum = q?.number || (examStore.currentIndex + 1);
      const reply = wasModalOpen
        ? `Submission cancelled. Resuming exam at Question ${qNum}. You can say "Read question", "Next question", or select an option.`
        : `You are continuing your active exam on Question ${qNum}. Say "Read question" to hear the question.`;
      return makeReply('RESUME_EXAM', reply, 'Resumed Exam (Cancelled Submission)');
    }
  }

  if (isFinalSubmit) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      speechEngine.stop();
      examStore.setSubmitModalOpen(false);
      soundEffects.playSuccess();
      void examStore.submitExam();
      const reply = 'Final submission confirmed. Submitting your examination now...';
      return makeReply('FINAL_SUBMIT', reply, 'Final Submitted Exam');
    }
  }

  // ==========================================
  // 1. QUERY AVAILABLE EXAMS & TESTS
  // ==========================================
  if (context.activeView === 'exam' && examStore.isSubmitModalOpen) {
    const isCancelSubmit =
      normalized.includes('cancel') ||
      normalized.includes('back') ||
      rawLower.includes('cancel') ||
      rawLower.includes('return') ||
      rawLower.includes('ruko') ||
      rawLower.includes('wapas') ||
      rawLower.includes('no') ||
      rawLower.includes('nahi') ||
      rawLower.includes('mat karo') ||
      rawLower.includes('close') ||
      rawLower.includes('band') ||
      rawLower.includes('don\'t submit') ||
      rawLower.includes('dont submit');

    const isConfirmSubmit =
      normalized.includes('submit') ||
      rawLower.includes('yes') ||
      rawLower.includes('final submit') ||
      rawLower.includes('yes submit') ||
      rawLower.includes('haan submit') ||
      rawLower.includes('haan') ||
      rawLower.includes('confirm') ||
      rawLower.includes('khatam') ||
      rawLower.includes('jama') ||
      rawLower.includes('finish') ||
      rawLower.includes('submit exam') ||
      rawLower.includes('submit kar do') ||
      rawLower.includes('submit kar dijiye');

    const isReadSubmitSummary =
      normalized.includes('read') ||
      normalized.includes('status') ||
      rawLower.includes('summary') ||
      rawLower.includes('kitne') ||
      rawLower.includes('batao') ||
      rawLower.includes('details');

    if (isCancelSubmit) {
      examStore.setSubmitModalOpen(false);
      const reply = isHindi
        ? `सबमिशन रद्द कर दिया गया। प्रश्न ${examStore.currentIndex + 1} पर वापस आ गए हैं। अब आप परीक्षा जारी रख सकते हैं।`
        : `Submission cancelled. Returning to Question ${examStore.currentIndex + 1}. You can now continue your test.`;
      return makeReply('CANCEL_SUBMIT', reply, 'Cancelled Exam Submission (Returned to Exam)');
    }

    if (isConfirmSubmit) {
      examStore.submitExam();
      const reply = isHindi
        ? 'परीक्षा सफलतापूर्वक सबमिट हो गई है! आपका प्रदर्शन रिपोर्ट लोड हो रहा है।'
        : 'Final submission confirmed! Your exam session has been submitted. Loading your performance Diagnostic Report.';
      return makeReply('FINAL_SUBMIT', reply, 'Final Submitted Exam Session');
    }

    if (isReadSubmitSummary) {
      const total = examStore.questions.length;
      const attempted = Object.keys(examStore.selectedOptions).length;
      const unattempted = total - attempted;
      const marked = Object.values(examStore.markedForReview).filter(Boolean).length;
      const reply = isHindi
        ? `सबमिशन सारांश: आपने कुल ${total} में से ${attempted} प्रश्नों के उत्तर दिए हैं। ${unattempted} प्रश्न अनुत्तरित हैं और ${marked} समीक्षा के लिए चिह्नित हैं। शेष समय ${examStore.formattedTime} है। परीक्षा समाप्त करने के लिए "हाँ, सबमिट करो" बोलें, या वापस जाने के लिए "कैंसल" बोलें।`
        : `Submission Summary: You have answered ${attempted} of ${total} questions. ${unattempted} questions unattempted, and ${marked} marked for review. Time remaining is ${examStore.formattedTime}. Say "Yes, final submit" to finish, or "Cancel" to return to the test.`;
      return makeReply('READ_SUBMIT_SUMMARY', reply, 'Read Submission Confirmation Details');
    }

    // Default guidance while submit modal is actively presented
    const reply = isHindi
      ? 'आप अभी "परीक्षा सबमिट पुष्टि" विंडो पर हैं। परीक्षा समाप्त करने के लिए "हाँ, सबमिट करो" बोलें, या वापस जाने के लिए "कैंसल" बोलें।'
      : 'You are currently on the "Confirm Exam Submission" dialog. Say "Yes, final submit" to finish your test, or "Cancel" to return to the exam.';
    return makeReply('SUBMIT_MODAL_GUIDANCE', reply);
  }
  // ==========================================
  // 1. TOP-LEVEL TAB & WORKSPACE NAVIGATION
  // Evaluated at the top so switching tabs never mistakenly starts an exam!
  // ==========================================

  // 1a. Analytics / Performance Dashboard Tab
  const isAnalyticsNav =
    (
      rawLower.includes('analytics') ||
      rawLower.includes('एनालिटिक्स') ||
      rawLower.includes('performance') ||
      rawLower.includes('परफॉरमेंस') ||
      rawLower.includes('score page') ||
      rawLower.includes('meri report') ||
      rawLower.includes('my stats') ||
      rawLower.includes('report tab') ||
      rawLower.includes('stats tab') ||
      (rawLower.includes('score') && (rawLower.includes('tab') || rawLower.includes('page') || rawLower.includes('dikhao') || rawLower.includes('kholo') || rawLower.includes('open') || rawLower.includes('go to')))
    ) &&
    !rawLower.includes('history') &&
    !rawLower.includes('accuracy') &&
    !rawLower.includes('best score') &&
    !rawLower.includes('questions solved');

  if (isAnalyticsNav) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'परीक्षा सबमिट किए बिना आप एनालिटिक्स नहीं देख सकते। कृपया पहले अपनी परीक्षा सबमिट करें।'
        : 'You cannot leave the exam before submitting it. Confirm submit modal is open. Please submit your test first.';
      return makeReply('CONFIRM_SUBMIT', reply, 'Opened Submit Modal (Exit Prevented)');
    }

    examStore.openAnalytics();
    const reply = isHindi
      ? `परफॉरमेंस एनालिटिक्स डैशबोर्ड खुल गया है। यहाँ आपके कुल ${context.totalSubmissions || 0} टेस्टों का रिकॉर्ड उपलब्ध है। अपनी समरी सुनने के लिए "समरी पढ़ो" बोलें, या टेस्ट पर लौटने के लिए "वापस जाओ" कहें।`
      : `Switched to Performance Analytics Dashboard. Here you can review your ${context.totalSubmissions || 0} completed tests. Say "Listen to summary" to hear your statistics, or "Back to tests" to return.`;
    return makeReply('VIEW_ANALYTICS', reply, 'Switched to Analytics Dashboard');
  }

  // 1b. Practice Arena Tab
  const isPracticeNav =
    isPracticeTabNavigation(rawTranscript) ||
    (
      (rawLower.includes('practice') || rawLower.includes('अभ्यास') || rawLower.includes('drill')) &&
      (rawLower.includes('tab') || rawLower.includes('arena') || rawLower.includes('page') || rawLower.includes('open') || rawLower.includes('show') || rawLower.includes('switch') || rawLower.includes('kholo') || rawLower.includes('chalo') || rawLower.includes('jao') || rawLower.includes('section')) &&
      !/(?:start|shuru|launch)\s+(?:speed\s+drill|quantitative|drill\s+\d+|practice\s+\d+)/i.test(rawLower)
    );

  if (isPracticeNav) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'परीक्षा सबमिट किए बिना आप प्रैक्टिस एरिना में नहीं जा सकते। कृपया पहले अपनी परीक्षा सबमिट करें।'
        : 'You cannot leave the live exam before submitting it. Please submit your test first.';
      return makeReply('CONFIRM_SUBMIT', reply, 'Opened Submit Modal (Exit Prevented)');
    }

    examStore.returnToCatalog();
    examStore.setPortalTab('practice');
    const drills = context.availableDrills;
    const reply = isHindi
      ? `प्रैक्टिस एरिना टैब पर आ गए हैं। यहाँ ${drills.length} अभ्यास उपलब्ध हैं। शुरू करने के लिए किसी भी अभ्यास का नाम बोलें।`
      : `Switched to Practice Arena tab with ${drills.length} practice drills available. Say "Start" followed by a drill name to begin.`;
    return makeReply('PRACTICE_TAB', reply, 'Switched to Practice Arena');
  }

  // 1c. Mock Tests / Exam Catalog Tab
  const isMockCatalogNav =
    (
      rawLower.includes('mock test tab') ||
      rawLower.includes('exam tab') ||
      rawLower.includes('catalog tab') ||
      rawLower.includes('test series') ||
      rawLower.includes('back to tests') ||
      rawLower.includes('go to tests') ||
      rawLower.includes('back to catalog') ||
      rawLower.includes('return to catalog') ||
      rawLower.includes('open catalog') ||
      rawLower.includes('मॉक टेस्ट टैब') ||
      rawLower.includes('कैटलॉग पर जाओ') ||
      rawLower.includes('कैटलॉग खोलो')
    );

  if (isMockCatalogNav) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'परीक्षा सबमिट किए बिना आप कैटलॉग पर नहीं जा सकते। कृपया पहले अपनी परीक्षा सबमिट करें।'
        : 'You cannot leave the live exam before submitting it. Please submit your test first.';
      return makeReply('CONFIRM_SUBMIT', reply, 'Opened Submit Modal (Exit Prevented)');
    }

    examStore.returnToCatalog();
    examStore.setPortalTab('exams');
    const exams = context.availableExams;
    const reply = isHindi
      ? `मॉक टेस्ट कैटलॉग पर आ गए हैं। यहाँ ${exams.length} परीक्षाएं उपलब्ध हैं। टेस्ट सुनने के लिए "टेस्ट लिस्ट बताओ" बोलें या शुरू करने के लिए टेस्ट का नाम कहें।`
      : `Switched to Mock Examinations Catalog with ${exams.length} available tests. Say "List available exams" or say "Start" followed by any test name.`;
    return makeReply('RETURN_CATALOG', reply, 'Switched to Mock Tests Catalog');
  }

  // 1d. Notifications Panel (Open / Close)
  const isNotificationCommand =
    rawLower.includes('notification') ||
    rawLower.includes('notif') ||
    rawLower.includes('नोटिफिकेशन') ||
    rawLower.includes('सूचना') ||
    rawLower.includes('alert');

  if (isNotificationCommand) {
    const isClose =
      rawLower.includes('close') ||
      rawLower.includes('band') ||
      rawLower.includes('hatao') ||
      rawLower.includes('hide') ||
      rawLower.includes('dismiss');

    if (isClose) {
      useNotificationStore.getState().toggleOpen(false);
      useNotificationStore.getState().closeNotificationDetail();
      soundEffects.playSelect();
      const reply = isHindi
        ? 'नोटिफिकेशन पैनल बंद कर दिया गया है।'
        : 'Notification panel closed.';
      return makeReply('CLOSE_NOTIFICATIONS', reply, 'Closed Notifications');
    }

    useNotificationStore.getState().toggleOpen(true);
    soundEffects.playSelect();
    const notifs = useNotificationStore.getState().notifications || [];
    const unread = notifs.filter((n) => !n.isRead);
    const topNotif = unread[0] || notifs[0];
    const topDetail = topNotif ? `${topNotif.title}: ${topNotif.message}` : '';
    const topAttached = topNotif ? resolveNotificationTestDetails(topNotif)?.testTitle : '';

    const reply = isHindi
      ? `नोटिफिकेशन पैनल खुल गया है। आपके पास ${unread.length} नए नोटिफिकेशन हैं।${topDetail ? ` हालिया: ${topDetail}।` : ''}${topAttached ? ` जुड़ा हुआ टेस्ट: "${topAttached}" शुरू करने के लिए Enter दबाएं।` : ''} बंद करने के लिए "नोटिफिकेशन बंद करो" बोलें या Escape दबाएँ।`
      : `Notification panel opened. You have ${unread.length} new notification${unread.length === 1 ? '' : 's'}.${topDetail ? ` Latest: ${topDetail}.` : ''}${topAttached ? ` Attached test: "${topAttached}". Say "Start test" or press Enter to launch.` : ''} Say "Close notifications" or press Escape to close.`;
    return makeReply('READ_NOTIFICATIONS', reply, 'Opened Notifications');
  }

  // 1e. Accessibility Settings Modal (Open / Close)
  const isSettingsOrA11yCommand =
    (
      rawLower.includes('setting') ||
      rawLower.includes('सेटिंग') ||
      rawLower.includes('accessibility') ||
      rawLower.includes('एक्सेसिबिलिटी') ||
      rawLower.includes('preference') ||
      rawLower.includes('प्राथमिकता') ||
      rawLower.includes('a11y')
    ) &&
    !rawLower.includes('theme') &&
    !rawLower.includes('थीम') &&
    !rawLower.includes('contrast') &&
    !rawLower.includes('font');

  if (isSettingsOrA11yCommand) {
    const isClose =
      rawLower.includes('close') ||
      rawLower.includes('band') ||
      rawLower.includes('hatao') ||
      rawLower.includes('exit') ||
      rawLower.includes('hide');

    if (isClose) {
      examStore.setSettingsOpen(false);
      soundEffects.playSelect();
      const reply = isHindi ? 'एक्सेसिबिलिटी सेटिंग्स बंद कर दी गई हैं।' : 'Accessibility Preferences modal closed.';
      return makeReply('CLOSE_SETTINGS', reply, 'Closed Settings Modal');
    }

    examStore.setSettingsOpen(true);
    soundEffects.playSelect();
    const reply = isHindi
      ? 'एक्सेसिबिलिटी प्राथमिकताएँ और सेटिंग्स खोल दी गई हैं। यहाँ आप थीम, कंट्रास्ट, फ़ॉन्ट का आकार और आवाज़ की गति बदल सकते हैं। बंद करने के लिए "सेटिंग्स बंद करो" बोलें या Escape दबाएँ।'
      : 'Accessibility Preferences opened. You can adjust themes, contrast, font scaling, and voice settings. Say "Close settings" or press Escape to return.';
    return makeReply('OPEN_SETTINGS', reply, 'Opened Accessibility Settings Modal');
  }

  // ==========================================
  // 2. RETURN TO CATALOG / MOCK TEST PAGE / CHOOSE ANOTHER EXAM
  // Evaluated BEFORE exam listings & Start Exam so "back to mock examination page",
  // "open mock test page", or "back to tests" always navigates to catalog!
  // ==========================================
  const allExams = [...examStore.availableExams, ...examStore.availablePracticeDrills];
  const matchedExamFromQuery = matchExamFromQuery(rawTranscript, null, allExams);

  const isStartIntent =
    /(?:start|take|begin|launch|shuru|chalu)\s+(?:test|exam|mock|drill|pariksha)?/i.test(rawLower) ||
    /^(?:start|take|shuru|begin|launch)$/i.test(normalized) ||
    rawLower.includes('start test') ||
    rawLower.includes('start exam') ||
    rawLower.includes('start mock') ||
    rawLower.includes('test shuru') ||
    rawLower.includes('exam shuru');

  const isNotificationContext =
    rawLower.includes('notification') ||
    rawLower.includes('notif') ||
    rawLower.includes('notific') ||
    rawLower.includes('सूचना');

  const isCatalogNavigation =
    !isStartIntent &&
    !matchedExamFromQuery &&
    !isContinueToExam &&
    !isNotificationContext &&
    !rawLower.includes('continue to exam') &&
    !rawLower.includes('return to exam') &&
    !rawLower.includes('back to exam') &&
    (
      // Clear intent to return/go to catalog or tests listing
      /(?:back|return|go|open|show|view|take me|navigate)\s+(?:to\s+)?(?:the\s+)?(?:catalog|mock\s+tests?|exams?|tests?|practice|drills?|home)/i.test(rawLower) ||
      /(?:catalog|mock\s+test|test\s+series|main\s+page|home\s+page)\s*(?:kholo|dikhao|par\s+jao|pe\s+jao|chalo)/i.test(rawLower) ||
      /^(?:catalog|mock\s+catalog|exam\s+catalog|home|back|return|wapas|exit)$/i.test(normalized) ||
      rawLower.includes('back to tests') ||
      rawLower.includes('back to catalog') ||
      rawLower.includes('return to catalog') ||
      rawLower.includes('open catalog') ||
      rawLower.includes('choose another exam') ||
      rawLower.includes('dusra exam') ||
      rawLower.includes('dusra test') ||
      ((context.activeView === 'report' || context.activeView === 'analytics') && (
        rawLower.includes('back') ||
        rawLower.includes('home') ||
        rawLower.includes('tests') ||
        rawLower.includes('catalog') ||
        rawLower.includes('wapas')
      ))
    );

  if (isCatalogNavigation) {
    // STRICT INTEGRITY: Cannot leave active unsubmitted exam
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'à¤ªà¤°à¥€à¤•à¥à¤·à¤¾ à¤¸à¤¬à¤®à¤¿à¤Ÿ à¤•à¤¿à¤ à¤¬à¤¿à¤¨à¤¾ à¤†à¤ª à¤¬à¤¾à¤¹à¤° à¤¨à¤¹à¥€à¤‚ à¤œà¤¾ à¤¸à¤•à¤¤à¥‡à¥¤ à¤¸à¤¬à¤®à¤¿à¤Ÿ à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤µà¤¿à¤‚à¤¡à¥‹ à¤–à¥à¤² à¤—à¤ˆ à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤ªà¤¹à¤²à¥‡ à¤…à¤ªà¤¨à¥€ à¤ªà¤°à¥€à¤•à¥à¤·à¤¾ à¤¸à¤¬à¤®à¤¿à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤'
        : 'You cannot leave the exam before submitting it. The submit confirmation window is now open. Please submit your test first.';
      return makeReply('CONFIRM_SUBMIT', reply, 'Opened Submit Modal (Exit Prevented)');
    }

    if (context.activeView === 'catalog') {
      const topExams = context.availableExams.slice(0, 3).map((e) => e.title).join(', ');
      const reply = isHindi
        ? `à¤†à¤ª à¤ªà¤¹à¤²à¥‡ à¤¸à¥‡ à¤¹à¥€ à¤®à¥‰à¤• à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤•à¥ˆà¤Ÿà¤²à¥‰à¤— à¤ªà¤° à¤¹à¥ˆà¤‚à¥¤ à¤¯à¤¹à¤¾à¤ ${context.availableExams.length} à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¹à¥ˆà¤‚, à¤œà¥ˆà¤¸à¥‡: ${topExams}à¥¤ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤•à¤¿à¤¸à¥€ à¤­à¥€ à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤•à¤¾ à¤¨à¤¾à¤® à¤¬à¥‹à¤²à¥‡à¤‚à¥¤`
        : `You are already on the Examination Catalog. Available tests include: ${topExams}. Say "Start" followed by any test name to begin.`;
      return makeReply('CATALOG_STATUS', reply, 'Already on Catalog');
    }

    examStore.returnToCatalog();
    examStore.setPortalTab('exams');
    const reply = isHindi
      ? 'à¤®à¥‰à¤• à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤•à¥ˆà¤Ÿà¤²à¥‰à¤— à¤ªà¤° à¤µà¤¾à¤ªà¤¸ à¤† à¤—à¤ à¤¹à¥ˆà¤‚à¥¤ à¤¸à¤­à¥€ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤¸à¥à¤•à¥à¤°à¥€à¤¨ à¤ªà¤° à¤ªà¥à¤°à¤¦à¤°à¥à¤¶à¤¿à¤¤ à¤¹à¥ˆà¤‚à¥¤ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤•à¤¿à¤¸à¥€ à¤­à¥€ à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤•à¤¾ à¤¨à¤¾à¤® à¤¬à¥‹à¤²à¥‡à¤‚à¥¤'
      : 'Returned to the Examination Catalog. All available mock tests are displayed on your screen. Say "Start" followed by any test name to begin.';
    return makeReply('RETURN_CATALOG', reply, 'Returned to Mock Tests Catalog');
  }

  // ==========================================
  // 2.5 SIGN OUT / LOGOUT
  // ==========================================
  const isSignOutIntent =
    /(?:sign\s*out|log\s*out|signout|logout|log\s*off|exit\s+account|sign\s+me\s+out|log\s+me\s+out|साइन\s*आउट|लॉग\s*आउट|अकाउंट\s*लॉग\s*आउट)/i.test(rawLower) ||
    /^(?:sign\s*out|log\s*out|signout|logout|लॉगआउट|साइनआउट)$/i.test(normalized);

  if (isSignOutIntent) {
    // STRICT INTEGRITY: If candidate is taking an active unsubmitted exam, prevent immediate sign-out
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'आप अभी एक सक्रिय परीक्षा दे रहे हैं। परीक्षा सबमिट किए बिना साइन आउट नहीं किया जा सकता। मैंने आपके लिए सबमिशन विंडो खोल दी है, कृपया पहले परीक्षा पूरी करें।'
        : 'You are currently in an active exam session. You cannot sign out before submitting your test. I have opened the submit confirmation modal for you.';
      return makeReply('WARN_SIGNOUT_ACTIVE_EXAM', reply, 'Opened Submit Modal (Sign-out Guard)');
    }

    const student = useAuthStore.getState().currentStudent;
    const isAdmin = useAuthStore.getState().isAdminAuthenticated;
    const name = student?.name || (isAdmin ? 'Administrator' : '');

    void useAuthStore.getState().logoutStudent();
    if (isAdmin) {
      useAuthStore.getState().logoutAdmin();
    }

    soundEffects.playNavigate();
    const reply = isHindi
      ? (name
          ? `नमस्ते ${name}, आप DristiX से सफलतापूर्वक साइन आउट हो चुके हैं। आपका दिन शुभ हो!`
          : 'आप DristiX से सफलतापूर्वक साइन आउट हो चुके हैं। आपका दिन शुभ हो!')
      : (name
          ? `Goodbye ${name}, you have been successfully signed out of DristiX. Have a wonderful day!`
          : 'You have been successfully signed out of DristiX. Have a wonderful day!');
    return makeReply('SIGN_OUT', reply, 'Signed out of account');
  }

  // ==========================================
  // 2.6 STUDENT / USER IDENTITY & PROFILE
  // ==========================================
  const isProfileIntent =
    /(?:who\s+am\s+i|my\s+profile|student\s+profile|user\s+profile|student\s+details|my\s+account|meri\s+profile|mera\s+profile|roll\s+number\s+kya\s+hai|kaun\s+hu|profile\s+batao|mera\s+naam)/i.test(rawLower) ||
    /^(?:profile|my\s+profile|who\s+am\s+i|account|profile\s+info)$/i.test(normalized);

  if (isProfileIntent) {
    const student = useAuthStore.getState().currentStudent;
    const isAdmin = useAuthStore.getState().isAdminAuthenticated;

    if (student) {
      const a11yPref = student.accessibilityPreference
        ? student.accessibilityPreference.replace(/-/g, ' ')
        : 'Standard';
      const reply = isHindi
        ? `प्रोफाइल विवरण: आपका नाम ${student.name} है, रोल नंबर ${student.rollNumber || 'दर्ज नहीं'}, ईमेल ${student.email || 'उपलब्ध नहीं'}। आपकी पंजीकृत सुगमता वरीयता ${a11yPref} है।`
        : `Student Profile: You are logged in as ${student.name}, roll number ${student.rollNumber || 'not assigned'}, email ${student.email || 'none'}. Registered accessibility preference: ${a11yPref}.`;
      return makeReply('STUDENT_PROFILE', reply, 'Read Student Profile');
    } else if (isAdmin) {
      const reply = isHindi
        ? 'आप एडमिनिस्ट्रेटर के रूप में लॉग इन हैं।'
        : 'You are logged in as Administrator.';
      return makeReply('STUDENT_PROFILE', reply, 'Read Admin Profile');
    } else {
      const reply = isHindi
        ? 'आप वर्तमान में एक अतिथि उपयोगकर्ता के रूप में ब्राउज़ कर रहे हैं। अपने छात्र खाते में जाने के लिए "लॉगिन" कहें।'
        : 'You are currently browsing as a guest. Say "Login" or "Sign in" to access your student account.';
      return makeReply('STUDENT_PROFILE', reply, 'Announced Guest Status');
    }
  }

  // ==========================================
  // 2.7 NAVIGATE TO LOGIN / SIGN IN
  // ==========================================
  const isLoginIntent =
    !isSignOutIntent &&
    (
      /(?:go\s+to\s+login|open\s+login|sign\s*in|log\s*in|login\s+kholo|login\s+karo|लॉगिन|साइन\s*इन)/i.test(rawLower) ||
      /^(?:login|sign\s*in|signin|लॉगिन)$/i.test(normalized)
    );

  if (isLoginIntent) {
    if (!useAuthStore.getState().currentStudent && !useAuthStore.getState().isAdminAuthenticated) {
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      soundEffects.playNavigate();
      const reply = isHindi
        ? 'लॉगिन पेज खुल गया है। कृपया अपना रोल नंबर और पासवर्ड दर्ज करें।'
        : 'Navigated to the Student Login portal. Please enter your roll number and password.';
      return makeReply('NAVIGATE_LOGIN', reply, 'Navigated to Student Login Portal');
    } else {
      const reply = isHindi
        ? 'आप पहले से ही अपने खाते में लॉग इन हैं।'
        : 'You are already signed in to your account.';
      return makeReply('NAVIGATE_LOGIN', reply, 'Already Signed In');
    }
  }

  // ==========================================
  // 2.7 SCROLL UP / SCROLL DOWN / SCROLL TOP / SCROLL BOTTOM
  // ==========================================
  const isScrollTop =
    normalized.includes('scroll_top') ||
    /(?:scroll\s+(?:to\s+)?top|go\s+to\s+top|page\s+top|top\s+(?:of\s+)?page|sabse\s+upar|top\s+par\s+jao|top\s+pe\s+jao)/i.test(rawLower);

  const isScrollBottom =
    normalized.includes('scroll_bottom') ||
    /(?:scroll\s+(?:to\s+)?bottom|go\s+to\s+bottom|page\s+bottom|bottom\s+(?:of\s+)?page|sabse\s+neeche|bottom\s+par\s+jao|bottom\s+pe\s+jao)/i.test(rawLower);

  const isScrollUp =
    !isScrollTop &&
    (normalized.includes('scroll_up') ||
     /(?:scroll\s+up|page\s+up|scroll\s+page\s+up|scroll\s+upar|upar\s+scroll|upar\s+karo|upar\s+jao|ऊपर\s*स्क्रॉल|ऊपर\s*करो|पेज\s*ऊपर)/i.test(rawLower));

  const isScrollDown =
    !isScrollBottom &&
    (normalized.includes('scroll_down') ||
     /(?:scroll\s+down|page\s+down|scroll\s+page\s+down|scroll\s+neeche|neeche\s+scroll|niche\s+scroll|neeche\s+karo|niche\s+karo|neeche\s+jao|niche\s+jao|नीचे\s*स्क्रॉल|नीचे\s*करो|पेज\s*नीचे)/i.test(rawLower));

  if (isScrollTop) {
    const result = performScroll('top', isHindi);
    return makeReply('SCROLL_TOP', result.reply, 'Scrolled to Top');
  }

  if (isScrollBottom) {
    const result = performScroll('bottom', isHindi);
    return makeReply('SCROLL_BOTTOM', result.reply, 'Scrolled to Bottom');
  }

  if (isScrollUp) {
    const result = performScroll('up', isHindi);
    return makeReply('SCROLL_UP', result.reply, 'Scrolled Up');
  }

  if (isScrollDown) {
    const result = performScroll('down', isHindi);
    return makeReply('SCROLL_DOWN', result.reply, 'Scrolled Down');
  }

  // ==========================================
  // 2.8 DASHBOARD & PORTAL OVERVIEW
  // ==========================================
  const isDashboardOverview =
    /(?:dashboard\s+overview|overview\s+of\s+dashboard|show\s+(?:me\s+)?(?:the\s+)?dashboard|open\s+(?:the\s+)?dashboard|dashboard\s+dikhao|dashboard\s+batao|dashboard\s+samjhao|portal\s+overview|catalog\s+overview|dashboard\s+kya\s+hai|dashboard\s+pe\s+kya\s+hai)/i.test(rawLower) ||
    /^(?:dashboard|dashboard\s+overview|portal\s+overview)$/i.test(rawLower) ||
    (rawLower.includes('dashboard') && (rawLower.includes('overview') || rawLower.includes('show') || rawLower.includes('explain') || rawLower.includes('batao') || rawLower.includes('dikhao') || rawLower.includes('samjhao') || rawLower.includes('kya hai') || rawLower.includes('details'))) ||
    // If not in live exam and user asks for general overview or screen overview
    (context.activeView !== 'exam' && (
      rawLower === 'overview' ||
      rawLower === 'portal overview' ||
      rawLower === 'dashboard' ||
      rawLower.includes('screen overview') ||
      rawLower.includes('page overview')
    ));

  if (isDashboardOverview && context.activeView !== 'exam') {
    const student = useAuthStore.getState().currentStudent;
    const isAdmin = useAuthStore.getState().isAdminAuthenticated;
    const exams = context.availableExams;
    const drills = context.availableDrills;
    const a = context.analytics;
    const curTheme = usePreferencesStore.getState().theme;
    const fontSize = usePreferencesStore.getState().fontSize;

    const themeDisplayNames: Record<string, { en: string; hi: string }> = {
      'teal-cream': { en: 'Teal & Cream (Ivory)', hi: 'टील एंड क्रीम' },
      'high-contrast': { en: 'High Contrast Black & Yellow', hi: 'हाई कंट्रास्ट ब्लैक एंड येलो' },
      'dark': { en: 'Deep Charcoal Dark', hi: 'डीप चारकोल डार्क' },
      'liquid-glass': { en: 'Liquid Glass Frost', hi: 'लिक्विड ग्लास' },
    };
    const themeName = themeDisplayNames[curTheme]?.en || curTheme;
    const themeNameHi = themeDisplayNames[curTheme]?.hi || curTheme;

    const userIdentEng = student
      ? `Signed in as candidate ${student.name} (Roll Number: ${student.rollNumber || 'assigned by institution'}). Registered accessibility mode: ${student.accessibilityPreference || 'Standard'}.`
      : (isAdmin ? 'Logged in as System Administrator.' : 'Currently browsing in guest candidate preview mode.');

    const userIdentHin = student
      ? `आप छात्र ${student.name} के रूप में लॉग इन हैं (रोल नंबर: ${student.rollNumber || 'संस्थान द्वारा जारी'})।`
      : (isAdmin ? 'आप एडमिनिस्ट्रेटर के रूप में लॉग इन हैं।' : 'आप वर्तमान में अतिथि मोड में हैं।');

    const trackRecordEng = a && a.totalTests > 0
      ? `Academic record: ${a.totalTests} completed tests with an average accuracy of ${a.averageAccuracy}%. Your highest score is ${a.bestScorePercentage}% in "${a.bestScoreTitle}". Total questions solved: ${a.questionsSolved}.`
      : 'You have not submitted any tests yet.';

    const trackRecordHin = a && a.totalTests > 0
      ? `अकादमिक रिकॉर्ड: कुल ${a.totalTests} टेस्ट पूर्ण, औसत सटीकता ${a.averageAccuracy}%। आपका सर्वोच्च स्कोर "${a.bestScoreTitle}" में ${a.bestScorePercentage}% रहा है।`
      : 'आपने अभी तक कोई टेस्ट सबमिट नहीं किया है।';

    const examHighlightsEng = exams.slice(0, 4).map((e, i) => `${i + 1}. ${e.title} (${e.durationMinutes} mins, ${e.questionCount} questions, ${e.difficulty} difficulty)`).join(', ');
    const examHighlightsHin = exams.slice(0, 4).map((e, i) => `${i + 1}. ${e.title} (${e.durationMinutes} मिनट, ${e.questionCount} प्रश्न, ${e.difficulty} स्तर)`).join(', ');

    const reply = isHindi
      ? `डैशबोर्ड ओवरव्यू: आप दृष्टिएक्स परीक्षा और अभ्यास पोर्टल डैशबोर्ड पर हैं। ${userIdentHin} पोर्टल में दो मुख्य अनुभाग हैं: पहला, समयबद्ध मॉक परीक्षा श्रृंखला (${exams.length} टेस्ट उपलब्ध हैं, जैसे: ${examHighlightsHin})। दूसरा, प्रैक्टिस एरिना (${drills.length} अभ्यास उपलब्ध हैं जिनमें ऑन-डिमांड संकेत और समाधान शामिल हैं)। सक्रिय थीम: ${themeNameHi} (${fontSize}% टेक्स्ट साइज)। ${trackRecordHin} प्रत्येक परीक्षा का विस्तृत विवरण सुनने के लिए "मॉक टेस्ट लिस्ट" बोलें, प्रैक्टिस शुरू करने के लिए "स्विच टू प्रैक्टिस" कहें, या सीधे टेस्ट शुरू करने के लिए "एसएससी सीजीएल शुरू करो" बोलें।`
      : `Dashboard Overview: You are on the DristiX Examination & Practice Portal Dashboard. ${userIdentEng} The portal offers two core learning tracks: 1. Full-Length Timed Mock Examinations with negative marking (${exams.length} tests available: ${examHighlightsEng}). 2. Practice Arena with untimed skill drills and step-by-step solutions (${drills.length} drills available). Active visual settings: ${themeName} theme at ${fontSize}% text zoom. ${trackRecordEng} Say "Available mock tests" to hear a complete breakdown of each examination, say "Switch to practice" for skill drills, or say "Start SSC CGL" to begin your test immediately.`;

    return makeReply('DASHBOARD_OVERVIEW', reply, 'Announced Comprehensive Dashboard Overview');
  }

  // ==========================================
  // 3. QUERY AVAILABLE EXAMS & TESTS (Detailed Explanations)
  // ==========================================
  const isPracticeSpecificList =
    rawLower.includes('practice drill') ||
    rawLower.includes('practice reels') ||
    rawLower.includes('practice reel') ||
    rawLower.includes('practice list') ||
    rawLower.includes('drill list') ||
    rawLower.includes('available practice') ||
    rawLower.includes('available drill') ||
    rawLower.includes('list practice') ||
    rawLower.includes('list drill') ||
    rawLower.includes('read practice') ||
    rawLower.includes('read drill') ||
    rawLower.includes('real practice') ||
    rawLower.includes('real drill') ||
    rawLower.includes('show practice') ||
    rawLower.includes('show drill') ||
    rawLower.includes('explain practice') ||
    rawLower.includes('explain drill') ||
    rawLower.includes('practice ke naam') ||
    rawLower.includes('drill ke naam') ||
    rawLower.includes('drills ke naam') ||
    rawLower.includes('reels ke naam') ||
    rawLower.includes('uplabdh practice') ||
    rawLower.includes('uplabdh drill') ||
    rawLower.includes('kaun se drill') ||
    rawLower.includes('kaun kaun se drill') ||
    rawLower.includes('kon se drill') ||
    rawLower.includes('which drill') ||
    rawLower.includes('what drill') ||
    rawLower.includes('which practice') ||
    rawLower.includes('what practice') ||
    ((rawLower.includes('practice') || rawLower.includes('drill') || rawLower.includes('reel') || rawLower.includes('अभ्यास')) &&
      (rawLower.includes('read') || rawLower.includes('real') || rawLower.includes('list') || rawLower.includes('available') || rawLower.includes('all') || rawLower.includes('show') || rawLower.includes('batao') || rawLower.includes('dikhao') || rawLower.includes('sunao') || rawLower.includes('explain') || rawLower.includes('padho')));

  const isExamListQuery =
    !isCatalogNavigation &&
    !isDashboardOverview &&
    (
      isPracticeSpecificList ||
      rawLower.includes('read all available') ||
      rawLower.includes('real all available') ||
      rawLower.includes('all available practice') ||
      rawLower.includes('all available exam') ||
      rawLower.includes('all available mock') ||
      rawLower.includes('all available test') ||
      rawLower.includes('all available drill') ||
      rawLower.includes('available mock') ||
      rawLower.includes('available exam') ||
      rawLower.includes('available test') ||
      rawLower.includes('available drill') ||
      rawLower.includes('mock examination list') ||
      rawLower.includes('mock exam list') ||
      rawLower.includes('examination list') ||
      rawLower.includes('list exam') ||
      rawLower.includes('list test') ||
      rawLower.includes('list mock') ||
      rawLower.includes('list drill') ||
      rawLower.includes('show mock') ||
      rawLower.includes('show test') ||
      rawLower.includes('show exam') ||
      rawLower.includes('show drill') ||
      rawLower.includes('read exam') ||
      rawLower.includes('read test') ||
      rawLower.includes('read mock') ||
      rawLower.includes('read drill') ||
      rawLower.includes('explain each exam') ||
      rawLower.includes('explain each test') ||
      rawLower.includes('explain each drill') ||
      rawLower.includes('explain tests') ||
      rawLower.includes('explain exams') ||
      rawLower.includes('explain drills') ||
      rawLower.includes('exams ke naam') ||
      rawLower.includes('test ke naam') ||
      rawLower.includes('tests ke naam') ||
      rawLower.includes('drills ke naam') ||
      rawLower.includes('drill ke naam') ||
      rawLower.includes('kaun kaun se test') ||
      rawLower.includes('kon kon se test') ||
      rawLower.includes('kaun se test') ||
      rawLower.includes('kon se test') ||
      rawLower.includes('konsa test') ||
      rawLower.includes('kaun sa test') ||
      rawLower.includes('uplabdh test') ||
      rawLower.includes('uplabdh exam') ||
      rawLower.includes('uplabdh drill') ||
      rawLower.includes('what exams') ||
      rawLower.includes('which exams') ||
      rawLower.includes('what tests') ||
      rawLower.includes('which tests') ||
      rawLower.includes('what drills') ||
      rawLower.includes('which drills') ||
      ((rawLower.includes('page') || rawLower.includes('yahan') || rawLower.includes('yaha')) &&
        (rawLower.includes('test') || rawLower.includes('exam') || rawLower.includes('mock') || rawLower.includes('drill') || rawLower.includes('practice')))
    );

  if (isExamListQuery) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      const reply = isHindi
        ? 'आप अभी एक लाइव परीक्षा दे रहे हैं। अन्य टेस्ट देखने के लिए पहले अपनी परीक्षा सबमिट करें।'
        : 'You are currently taking an active exam. Please finish or submit your exam first before viewing other tests.';
      return makeReply('EXAM_IN_PROGRESS', reply, 'Exam In Progress');
    }

    // If user asks for exam listing while on analytics or report, navigate to catalog so they see it
    if (context.activeView !== 'catalog') {
      examStore.returnToCatalog();
    }

    const isPracticeListing =
      isPracticeSpecificList ||
      (context.portalTab === 'practice' && !rawLower.includes('mock') && !rawLower.includes('exam'));

    examStore.setPortalTab(isPracticeListing ? 'practice' : 'exams');

    if (isPracticeListing) {
      const drills = context.availableDrills;
      const drillDetailsEng = drills.map((d, idx) => {
        const qCount = d.questionCount || (d as any).totalQuestions || 5;
        return `Drill ${idx + 1}: "${d.title}". Topic: ${d.category}. Duration: ${d.durationMinutes} minutes with ${qCount} questions. Features on-demand hints, audio explanation, and zero negative marking.`;
      }).join(' ');

      const drillDetailsHin = drills.map((d, idx) => {
        const qCount = d.questionCount || (d as any).totalQuestions || 5;
        return `ड्रिल ${idx + 1}: "${d.title}"। विषय: ${d.category}। अवधि: ${d.durationMinutes} मिनट, ${qCount} प्रश्न। ऑन-डिमांड संकेत, ऑडियो स्पष्टीकरण और शून्य निगेटिव मार्किंग के साथ।`;
      }).join(' ');

      const reply = isHindi
        ? `प्रैक्टिस एरिना में कुल ${drills.length} अभ्यास उपलब्ध हैं: ${drillDetailsHin} शुरू करने के लिए "ड्रिल 1 शुरू करो" बोलें या अभ्यास का नाम कहें।`
        : `The Practice Arena contains ${drills.length} practice drills: ${drillDetailsEng} Say "Start" followed by a drill name or say "Start Drill 1" to begin.`;
      return makeReply('LIST_PRACTICE_DRILLS', reply, 'Explained Available Practice Drills in Detail');
    }

    const exams = context.availableExams;
    const count = exams.length;

    const examDetailsEng = exams.map((e, idx) => {
      const qCount = e.questionCount || (e as any).totalQuestions || 5;
      const neg = e.negativeMarking || '-0.50 negative marking for incorrect answers';
      return `Test ${idx + 1}: "${e.title}". Domain: ${e.category}. Difficulty: ${e.difficulty}. Structure: ${qCount} questions to be completed in ${e.durationMinutes} minutes. Marking policy: 2 marks per question with ${neg}.`;
    }).join(' ');

    const examDetailsHin = exams.map((e, idx) => {
      const qCount = e.questionCount || (e as any).totalQuestions || 5;
      const neg = e.negativeMarking || 'गलत उत्तर पर -0.50 निगेटिव मार्किंग';
      return `टेस्ट ${idx + 1}: "${e.title}"। अनुभाग: ${e.category}। स्तर: ${e.difficulty}। संरचना: ${qCount} प्रश्न, ${e.durationMinutes} मिनट अवधि। मार्किंग: 2 अंक प्रति प्रश्न तथा ${neg}।`;
    }).join(' ');

    const reply = isHindi
      ? `उपलब्ध मॉक परीक्षाओं का विस्तृत विवरण (कुल ${count} टेस्ट): ${examDetailsHin} शुरू करने के लिए आप किसी भी टेस्ट का नाम बोल सकते हैं, जैसे "पहला टेस्ट शुरू करो", "एसएससी सीजीएल शुरू करो", या "सीसैट टेस्ट शुरू करो"।`
      : `Here is the detailed overview of all ${count} available mock examinations: ${examDetailsEng} To launch any examination, simply speak its name, for example: "Start Test 1", "Start SSC CGL", or "Start CSAT Practice Test".`;

    return makeReply('LIST_EXAMS', reply, 'Explained Available Mock Exams in Detail');
  }

  // ==========================================
  // 3. THEME LISTING & SELECTION (ACCESSIBILITY ENGINE)
  // ==========================================
  const isListThemes =
    (rawLower.includes('theme') || rawLower.includes('थीम')) &&
    (
      rawLower.includes('kaun') ||
      rawLower.includes('kon') ||
      rawLower.includes('kya') ||
      rawLower.includes('batao') ||
      rawLower.includes('naam') ||
      rawLower.includes('name') ||
      rawLower.includes('konsi') ||
      rawLower.includes('available') ||
      rawLower.includes('list') ||
      rawLower.includes('show') ||
      rawLower.includes('sare') ||
      rawLower.includes('saare') ||
      rawLower.includes('all') ||
      rawLower.includes('kitne') ||
      rawLower.includes('what') ||
      rawLower.includes('options')
    ) &&
    !rawLower.includes('high contrast') &&
    !rawLower.includes('liquid glass') &&
    !rawLower.includes('teal') &&
    !rawLower.includes('cream');

  if (isListThemes) {
    const reply = isHindi
      ? 'सिस्टम में कुल 4 एक्सेसिबिलिटी थीम उपलब्ध हैं: 1. हाई कंट्रास्ट थीम (गहरा काला और इलेक्ट्रिक यलो, 21:1 अधिकतम कंट्रास्ट), 2. डार्क थीम (चारकोल ब्लैक और एमराल्ड ग्रीन), 3. टील एंड क्रीम थीम (वॉर्म आइवरी और गहरा टील), और 4. लिक्विड ग्लास थीम (फ़्रॉस्टेड क्रिस्टल पर्पल)। किसी भी थीम को लगाने के लिए बोलें: "हाई कंट्रास्ट थीम लगाओ" या "डार्क थीम चुनो"।'
      : 'There are 4 accessibility themes available: 1. High Contrast theme (pure black and electric yellow, 21:1 maximum contrast), 2. Charcoal Dark theme (matte charcoal and emerald green), 3. Teal & Cream theme (warm ivory and deep teal), and 4. Liquid Glass theme (frosted light amethyst). Say "Select High Contrast theme" or "Select Dark theme" to apply any of them.';
    return makeReply('LIST_THEMES', reply, 'Listed Available Themes');
  }

  // 3b. High Contrast Theme Selection
  const isHighContrast =
    rawLower.includes('high contrast') ||
    rawLower.includes('हाई कंट्रास्ट') ||
    (rawLower.includes('contrast') && (
      rawLower.includes('high') ||
      rawLower.includes('select') ||
      rawLower.includes('apply') ||
      rawLower.includes('set') ||
      rawLower.includes('lagao') ||
      rawLower.includes('karo') ||
      rawLower.includes('chuno') ||
      rawLower.includes('theme') ||
      rawLower.includes('थीम')
    ));

  if (isHighContrast) {
    usePreferencesStore.getState().setTheme('high-contrast');
    soundEffects.playSelect();
    const reply = isHindi
      ? 'हाई कंट्रास्ट थीम लागू कर दी गई है। बैकग्राउंड गहरा काला और टेक्स्ट ब्राइट यलो हो गया है।'
      : 'High Contrast theme has been applied with pure black background and electric yellow text.';
    return makeReply('SELECT_THEME', reply, 'Applied High Contrast Theme');
  }

  // 3c. Dark Theme Selection
  const isDarkTheme =
    !isHighContrast &&
    (rawLower.includes('dark') || rawLower.includes('डार्क') || rawLower.includes('night mode') || rawLower.includes('नाइट मोड') || rawLower.includes('काला थीम')) &&
    (
      rawLower.includes('theme') ||
      rawLower.includes('थीम') ||
      rawLower.includes('mode') ||
      rawLower.includes('मोड') ||
      rawLower.includes('select') ||
      rawLower.includes('apply') ||
      rawLower.includes('set') ||
      rawLower.includes('lagao') ||
      rawLower.includes('karo') ||
      rawLower.includes('chuno')
    );

  if (isDarkTheme) {
    usePreferencesStore.getState().setTheme('dark');
    soundEffects.playSelect();
    const reply = isHindi
      ? 'डार्क थीम लागू कर दी गई है। चारकोल बैकग्राउंड और एमराल्ड ग्रीन एक्सेंट सेट हो गए हैं।'
      : 'Charcoal Dark theme has been applied with emerald green accents.';
    return makeReply('SELECT_THEME', reply, 'Applied Dark Theme');
  }

  // 3d. Teal & Cream Theme Selection
  const isTealCream =
    (rawLower.includes('teal') || rawLower.includes('cream') || rawLower.includes('ivory') || rawLower.includes('light') || rawLower.includes('लाइट') || rawLower.includes('क्रीम') || rawLower.includes('टील')) &&
    (
      rawLower.includes('theme') ||
      rawLower.includes('थीम') ||
      rawLower.includes('mode') ||
      rawLower.includes('मोड') ||
      rawLower.includes('select') ||
      rawLower.includes('apply') ||
      rawLower.includes('set') ||
      rawLower.includes('lagao') ||
      rawLower.includes('karo') ||
      rawLower.includes('chuno')
    );

  if (isTealCream) {
    usePreferencesStore.getState().setTheme('teal-cream');
    soundEffects.playSelect();
    const reply = isHindi
      ? 'टील एंड क्रीम थीम लागू कर दी गई है। वॉर्म आइवरी बैकग्राउंड और गहरा टील सेट हो गया है।'
      : 'Teal & Cream theme has been applied with warm ivory background and deep teal accents.';
    return makeReply('SELECT_THEME', reply, 'Applied Teal & Cream Theme');
  }

  // 3e. Liquid Glass Theme Selection
  const isLiquidGlass =
    (rawLower.includes('glass') || rawLower.includes('liquid') || rawLower.includes('purple') || rawLower.includes('frosted') || rawLower.includes('ग्लास') || rawLower.includes('लिक्विड')) &&
    (
      rawLower.includes('theme') ||
      rawLower.includes('थीम') ||
      rawLower.includes('mode') ||
      rawLower.includes('मोड') ||
      rawLower.includes('select') ||
      rawLower.includes('apply') ||
      rawLower.includes('set') ||
      rawLower.includes('lagao') ||
      rawLower.includes('karo') ||
      rawLower.includes('chuno')
    );

  if (isLiquidGlass) {
    usePreferencesStore.getState().setTheme('liquid-glass');
    soundEffects.playSelect();
    const reply = isHindi
      ? 'लिक्विड ग्लास थीम लागू कर दी गई है। फ्रॉस्टेड पर्पल क्रिस्टल सतह सेट हो गई है।'
      : 'Liquid Glass theme has been applied with frosted amethyst crystal surfaces.';
    return makeReply('SELECT_THEME', reply, 'Applied Liquid Glass Theme');
  }

  // 3f. Font Scaling Adjustment
  const isFontCommand =
    (rawLower.includes('font') || rawLower.includes('फ़ॉन्ट') || rawLower.includes('फॉन्ट') || rawLower.includes('text size') || rawLower.includes('font size')) &&
    (
      rawLower.includes('badhao') ||
      rawLower.includes('ghatao') ||
      rawLower.includes('kam') ||
      rawLower.includes('bada') ||
      rawLower.includes('chhota') ||
      rawLower.includes('increase') ||
      rawLower.includes('decrease') ||
      rawLower.includes('100') ||
      rawLower.includes('125') ||
      rawLower.includes('150') ||
      rawLower.includes('175') ||
      rawLower.includes('200') ||
      rawLower.includes('reset') ||
      rawLower.includes('normal')
    );

  if (isFontCommand) {
    const currentSize = usePreferencesStore.getState().fontSize;
    const scales: TextScale[] = [100, 125, 150, 175, 200];
    let targetSize = currentSize;

    if (rawLower.includes('200')) targetSize = 200;
    else if (rawLower.includes('175')) targetSize = 175;
    else if (rawLower.includes('150')) targetSize = 150;
    else if (rawLower.includes('125')) targetSize = 125;
    else if (rawLower.includes('100') || rawLower.includes('reset') || rawLower.includes('normal') || rawLower.includes('default')) targetSize = 100;
    else if (rawLower.includes('increase') || rawLower.includes('badhao') || rawLower.includes('bada') || rawLower.includes('large') || rawLower.includes('plus')) {
      const idx = scales.indexOf(currentSize);
      targetSize = idx < scales.length - 1 ? scales[idx + 1] : scales[scales.length - 1];
    } else if (rawLower.includes('decrease') || rawLower.includes('ghatao') || rawLower.includes('kam') || rawLower.includes('chhota') || rawLower.includes('small') || rawLower.includes('minus')) {
      const idx = scales.indexOf(currentSize);
      targetSize = idx > 0 ? scales[idx - 1] : scales[0];
    }

    usePreferencesStore.getState().setFontSize(targetSize);
    soundEffects.playSelect();
    const reply = isHindi
      ? `फ़ॉन्ट का आकार ${targetSize}% पर सेट कर दिया गया है।`
      : `Font scaling set to ${targetSize}%.`;
    return makeReply('SET_FONT_SIZE', reply, `Set Font Size to ${targetSize}%`);
  }

  // ==========================================
  // 4. KEYBOARD SHORTCUTS MODAL
  // ==========================================
  const isShortcutsCommand =
    (rawLower.includes('shortcut') || rawLower.includes('शॉर्टकट')) &&
    !rawLower.includes('suggestion') &&
    !rawLower.includes('सुझाव');

  if (isShortcutsCommand) {
    const isClose =
      rawLower.includes('close') ||
      rawLower.includes('band') ||
      rawLower.includes('hatao') ||
      rawLower.includes('exit') ||
      rawLower.includes('hide') ||
      rawLower.includes('रद्द') ||
      rawLower.includes('हटाओ') ||
      rawLower.includes('बंद');

    if (isClose) {
      examStore.setShortcutsOpen(false);
      soundEffects.playSelect();
      const reply = isHindi
        ? 'कीबोर्ड शॉर्टकट गाइड बंद कर दी गई है।'
        : 'Keyboard Shortcuts modal closed.';
      return makeReply('CLOSE_SHORTCUTS', reply, 'Closed Shortcuts Modal');
    }

    examStore.setShortcutsOpen(true);
    soundEffects.playSelect();
    const reply = isHindi
      ? 'कीबोर्ड शॉर्टकट गाइड खुल गई है। अगले प्रश्न के लिए N, पिछले के लिए P, विकल्पों के लिए 1 से 4, समय के लिए T, और सेटिंग्स के लिए A दबाएँ। बंद करने के लिए Escape दबाएँ।'
      : 'Keyboard Navigation Shortcuts Guide opened. Press N for Next Question, P for Previous, 1 to 4 for Options, T for Time, and A for Accessibility Preferences.';
    return makeReply('OPEN_SHORTCUTS', reply, 'Opened Shortcuts Modal');
  }

  // ==========================================
  // 4.5 CONTEXTUAL VOICE SUGGESTIONS & PROACTIVE GUIDANCE
  // ==========================================
  const isVoiceSuggestionsCommand =
    normalized.includes('help_suggestions') ||
    rawLower.includes('suggestion') ||
    rawLower.includes('सुझाव') ||
    rawLower.includes('sujhav') ||
    rawLower.includes('what can i do') ||
    rawLower.includes('kya kar sakte') ||
    rawLower.includes('kya karu') ||
    rawLower.includes('kya karein') ||
    rawLower.includes('क्या कर सकते') ||
    rawLower.includes('मदद') ||
    rawLower.includes('सहायता') ||
    rawLower.includes('help') ||
    rawLower.includes('commands') ||
    rawLower.includes('options kya hai') ||
    rawLower.includes('kya options hain');

  if (isVoiceSuggestionsCommand) {
    soundEffects.playSelect();
    let reply = '';
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      const q = context.currentQuestion;
      const totalQ = context.currentExam?.totalQuestions || 10;
      reply = isHindi
        ? `आप अभी परीक्षा दे रहे हैं, प्रश्न ${totalQ} में से प्रश्न ${q?.number || 1} पर हैं। आपके लिए मुख्य वॉयस सुझाव: 1. प्रश्न और विकल्प सुनने के लिए "प्रश्न पढ़ो" बोलें। 2. उत्तर चुनने के लिए "विकल्प 1", "विकल्प 2", "3" या "4" बोलें। 3. आगे बढ़ने के लिए "अगला प्रश्न" या "पिछला प्रश्न" बोलें। 4. समय जानने के लिए "समय बताओ" बोलें। 5. पूरा होने पर "परीक्षा सबमिट करो" बोलें।`
        : `You are currently in a live exam on Question ${q?.number || 1} of ${totalQ}. Voice suggestions: 1. Say "Read question" to hear the question and options. 2. Say "Option 1, 2, 3 or 4" to select your answer. 3. Say "Next question" or "Previous question" to navigate. 4. Say "Check timer" for time remaining. 5. Say "Submit exam" when you finish.`;
    } else if (context.isSubmitModalOpen) {
      reply = isHindi
        ? 'सबमिट पुष्टि विंडो खुली है। परीक्षा समाप्त करके परिणाम देखने के लिए "हाँ फाइनल सबमिट" बोलें। या समीक्षा जारी रखने के लिए "परीक्षा जारी रखो" बोलें।'
        : 'Submit confirmation modal is open. Say "Yes, Final Submit" to finish the test and view your score report. Or say "Continue to Exam" to keep reviewing questions.';
    } else if (context.activeView === 'report') {
      const score = context.diagnosticReport?.totalScore ?? 0;
      const max = context.diagnosticReport?.maxScore ?? 20;
      reply = isHindi
        ? `परीक्षा सबमिट हो चुकी है, आपका स्कोर ${max} में से ${score} है। आप बोल सकते हैं: 1. "समरी पढ़ो" - पूरा परफॉर्मेंस सुनने के लिए। 2. "दोबारा टेस्ट दो" - फिर से अभ्यास करने के लिए। 3. "मॉक टेस्ट पेज पर जाओ" - कैटलॉग पर लौटने के लिए।`
        : `Your exam has been submitted with score ${score} out of ${max}. You can say: 1. "Read summary" for detailed score analysis. 2. "Retake test" to try again. 3. "Go to mock test page" to return to the catalog.`;
    } else if (context.activeView === 'analytics') {
      reply = isHindi
        ? 'आप परफॉर्मेंस एनालिटिक्स डैशबोर्ड पर हैं। आप बोल सकते हैं: 1. "समरी सुनो" - कुल स्कोर और सटीकता के लिए। 2. "हिस्ट्री बताओ" - पिछले टेस्ट परिणामों के लिए। 3. "टेस्ट पेज पर जाओ" - नए टेस्ट देने के लिए।'
        : 'You are on your Performance Analytics dashboard. You can say: 1. "Listen to summary" for your overall accuracy and metrics. 2. "History" to review past exams. 3. "Back to tests" to select another mock test.';
    } else {
      // Default: Catalog or general view
      const topExams = context.availableExams.slice(0, 3).map((e) => e.title).join(', ');
      reply = isHindi
        ? `आप मॉक टेस्ट कैटलॉग पर हैं। यहाँ ${context.availableExams.length} टेस्ट उपलब्ध हैं, जैसे: ${topExams}। आप बोल सकते हैं: 1. किसी भी टेस्ट का नाम बोलकर शुरू करने के लिए "Start" और टेस्ट का नाम बोलें। 2. सभी टेस्ट सुनने के लिए "टेस्ट लिस्ट बताओ" बोलें। 3. सूचनाएं देखने के लिए "नोटिफिकेशन खोलो" बोलें।`
        : `You are on the Mock Examinations Catalog with ${context.availableExams.length} mock tests available, including: ${topExams}. Voice suggestions: 1. Say "Start" followed by any test name to begin. 2. Say "List available exams" to hear all tests. 3. Say "Open notifications" to check announcements.`;
    }
    return makeReply('VOICE_SUGGESTIONS', reply, 'Provided Voice Suggestions');
  }

  // ==========================================
  // 5. START AN EXAM OR PRACTICE TEST
  // ==========================================
  if (
    !isCatalogNavigation &&
    !isSettingsOrA11yCommand &&
    !isShortcutsCommand &&
    !isExamListQuery &&
    !rawLower.includes('setting') &&
    !rawLower.includes('accessibility') &&
    !rawLower.includes('preference') &&
    !rawLower.includes('shortcut') &&
    !rawLower.includes('read all') &&
    !rawLower.includes('real all') &&
    !rawLower.includes('available practice') &&
    !rawLower.includes('available drill') &&
    !rawLower.includes('available exam') &&
    !rawLower.includes('available mock') &&
    !rawLower.includes('available test') &&
    !rawLower.includes('list practice') &&
    !rawLower.includes('list drill') &&
    !rawLower.includes('list exam') &&
    !rawLower.includes('list test') &&
    !rawLower.includes('drill list') &&
    !rawLower.includes('practice list') &&
    (
      !!matchedExamFromQuery ||
      (
        !rawLower.includes('page') &&
        !rawLower.includes('catalog') &&
        (
          normalized.includes('start') ||
          normalized.includes('shuru') ||
          rawLower.includes('exam do') ||
          rawLower.includes('test lagao') ||
          rawLower.includes('ak exam') ||
          rawLower.includes('ek exam') ||
          (rawLower.includes('exam') && (rawLower.includes('karo') || rawLower.includes('do') || rawLower.includes('dikhao') || rawLower.includes('kholo') || rawLower.includes('open') || rawLower.includes('start'))) ||
          (rawLower.includes('test') && (rawLower.includes('karo') || rawLower.includes('do') || rawLower.includes('dikhao') || rawLower.includes('kholo') || rawLower.includes('open') || rawLower.includes('start'))) ||
          (rawLower.includes('drill') && (rawLower.includes('karo') || rawLower.includes('do') || rawLower.includes('dikhao') || rawLower.includes('kholo') || rawLower.includes('open') || rawLower.includes('start')))
        )
      )
    )
  ) {
    // STRICT INTEGRITY: If candidate is taking a test, prevent switching exams before submitting
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'एक परीक्षा पहले से चल रही है। सबमिट किए बिना आप इसे छोड़ नहीं सकते या दूसरा टेस्ट शुरू नहीं कर सकते।'
        : 'An exam is currently in progress. You cannot leave or start another test before submitting this one. Please confirm submission.';
      return makeReply('CONFIRM_SUBMIT', reply, 'Opened Submit Modal (Exam Switch Prevented)');
    }

    const notifStore = useNotificationStore.getState();
    const sortedNotifs = [...notifStore.notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Only treat as notification launch if candidate did NOT specify a specific exam/drill,
    // and is explicitly asking for notification or has notification modal open
    const isNotificationContext = Boolean(
      !matchedExamFromQuery &&
      (
        ((notifStore.isOpen || Boolean(notifStore.activeNotification)) &&
          (rawLower.includes('this test') || rawLower.includes('ye test') || rawLower.includes('open') || rawLower.includes('start'))) ||
        rawLower.includes('notification') ||
        rawLower.includes('notif') ||
        rawLower.includes('suchna') ||
        rawLower.includes('new test') ||
        rawLower.includes('naya test') ||
        rawLower.includes('naya mock') ||
        rawLower.includes('latest test')
      )
    );

    const activeTest = isNotificationContext
      ? (resolveNotificationTestDetails(notifStore.activeNotification) ||
         (() => {
           for (const n of sortedNotifs) {
             const d = resolveNotificationTestDetails(n);
             if (d?.testId || d?.code || d?.testTitle) return d;
           }
           return null;
         })())
      : null;

    let targetExam: Exam | null = null;
    if (isNotificationContext && activeTest) {
      const dtId = (activeTest.testId || '').toLowerCase();
      const dtCode = (activeTest.code || '').toLowerCase();
      const dtTitle = (activeTest.testTitle || '').toLowerCase();

      targetExam =
        allExams.find(
          (e) =>
            (dtId && (e.id.toLowerCase() === dtId || String((e as any)._id).toLowerCase() === dtId)) ||
            (dtCode && e.code && e.code.toLowerCase() === dtCode) ||
            (dtTitle && e.title && e.title.toLowerCase() === dtTitle) ||
            (dtTitle && e.title && e.title.toLowerCase().includes(dtTitle))
        ) || null;

      if (!targetExam) {
        targetExam = {
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
      targetExam = matchedExamFromQuery;
      // Only default to first exam if candidate explicitly specified "first test" or "test 1"
      if (!targetExam && (
        rawLower.includes('first test') ||
        rawLower.includes('first exam') ||
        rawLower.includes('pehla test') ||
        rawLower.includes('pehli pariksha') ||
        rawLower.includes('test 1') ||
        rawLower.includes('exam 1') ||
        rawLower.includes('drill 1')
      )) {
        targetExam = allExams.length > 0 ? allExams[0] : null;
      }
    }

    if (!targetExam) {
      const topNames = allExams.slice(0, 3).map((e) => e.title).join(', ');
      const reply = isHindi
        ? `à¤†à¤ª à¤•à¥Œà¤¨ à¤¸à¤¾ à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚? à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤¹à¥ˆà¤‚: ${topNames}à¥¤ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ "Start" à¤”à¤° à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤•à¤¾ à¤¨à¤¾à¤® à¤¬à¥‹à¤²à¥‡à¤‚, à¤œà¥ˆà¤¸à¥‡ "Start SSC CGL" à¤¯à¤¾ "Start Data Test"à¥¤`
        : `Which exam would you like to start? Available tests include: ${topNames}. Say "Start" followed by the test name, such as "Start SSC CGL" or "Start Data Test".`;
      return makeReply('START_EXAM_PROMPT', reply, 'Prompted for Exam Name');
    }

    if (!targetExam) {
      const emptyMsg = isHindi
        ? 'कोई परीक्षा उपलब्ध नहीं है।'
        : 'No examinations are available right now.';
      return makeReply('START_EXAM', emptyMsg, 'No Exams Available');
    }

    const matchedExam = targetExam;

    // Close notifications panel/modal if open
    if (notifStore.isOpen || notifStore.activeNotification) {
      notifStore.toggleOpen(false);
      notifStore.closeNotificationDetail();
    }

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }

    // The confirmation reply below is spoken for this action, so the store's
    // own "Starting…" line is suppressed — otherwise it interrupts the reply.
    const isNotificationLaunch = Boolean(isNotificationContext && activeTest);
    const isPracticeExam =
      (isNotificationLaunch && activeTest?.testType === 'practice') ||
      matchedExam.id.includes('drill') ||
      matchedExam.id.includes('practice') ||
      (matchedExam.code && (matchedExam.code.startsWith('PRACTICE-') || matchedExam.code.includes('PO-02'))) ||
      matchedExam.negativeMarking === 'No negative marking (Practice)';

    const launchId = isNotificationLaunch
      ? (activeTest?.testId || matchedExam?.id || activeTest?.code || activeTest?.testTitle || '')
      : (matchedExam?.id || matchedExam?.code || '');

    void examStore.selectExam(
      launchId,
      isPracticeExam ? 'practice' : 'exam',
      {
        announce: false,
        testDetails: isNotificationLaunch ? (activeTest || null) : null,
      }
    );
    const qCount = matchedExam.questionCount || (matchedExam.questions ? matchedExam.questions.length : 5);
    const duration = matchedExam.durationMinutes || 30;
    const reply = isHindi
      ? `"${matchedExam.title}" शुरू किया जा रहा है। कुल ${qCount} प्रश्न और ${duration} मिनट समय है। प्रश्न 1 लोड हो चुका है। प्रश्न सुनने के लिए "प्रश्न पढ़ो" बोलें या 1 से 4 विकल्प चुनें।`
      : `Starting "${matchedExam.title}": ${qCount} questions, ${duration} minutes duration. Question 1 is loaded. Say "Read question" or speak "Option 1" through "Option 4" to answer.`;
    return makeReply('START_EXAM', reply, `Started Exam: ${matchedExam.title}`);
  }

  // ==========================================
  // 4. READ CURRENT QUESTION & FORMULAS (In Exam)
  // ==========================================
  const isReadQuestionIntent =
    normalized.includes('read_question') ||
    normalized.includes('formula') ||
    rawLower.includes('sawal padho') ||
    rawLower.includes('question padho') ||
    rawLower.includes('question repeat') ||
    rawLower.includes('dobara bolo') ||
    rawLower.includes('phir se bolo') ||
    rawLower.includes('options padho') ||
    rawLower.includes('read option') ||
    rawLower.includes('option padho') ||
    /(?:read|speak|repeat)\s+(?:the\s+)?(?:question|problem|options?|statement|prompt|this\s+question)/i.test(rawLower) ||
    /^(?:read|read\s+question|read\s+again|repeat|padho|sawal\s+sunao)$/i.test(rawLower);

  if (isReadQuestionIntent) {
    if (context.activeView !== 'exam' || !context.currentQuestion) {
      const reply = isHindi
        ? 'आप अभी किसी परीक्षा में नहीं हैं। टेस्ट शुरू करने के लिए "टेस्ट शुरू करो" बोलें।'
        : 'You are not currently in an exam. Say "Start exam" to begin a test.';
      return makeReply('NOT_IN_EXAM', reply);
    }

    const q = context.currentQuestion;
    const reply = buildFullQuestionSpeech(q);
    return makeReply('READ_QUESTION', reply, 'Read Question and Options');
  }

  // ==========================================
  // 5. SELECT OPTION (1, 2, 3, 4 / A, B, C, D)
  // ==========================================
  if (
    normalized.includes('option 1') ||
    normalized.includes('option 2') ||
    normalized.includes('option 3') ||
    normalized.includes('option 4')
  ) {
    if (context.activeView !== 'exam') {
      const reply = isHindi
        ? 'विकल्प चुनने से पहले कृपया कोई टेस्ट शुरू करें।'
        : 'Please start an exam first before selecting an option. Say "Start exam" to begin.';
      return makeReply('NOT_IN_EXAM', reply);
    }

    let optNum = 1;
    if (normalized.includes('option 2')) optNum = 2;
    else if (normalized.includes('option 3')) optNum = 3;
    else if (normalized.includes('option 4')) optNum = 4;

    examStore.selectOption(optNum, { announce: false });
    // One message, carrying the option's own words: "Option 3 selected
    // successfully" alone leaves a candidate working without sight unable to
    // tell which answer actually went on the record.
    const { questions, currentIndex, selectedOptions } = useExamStore.getState();
    const total = questions.length;
    const answeredCount = Object.keys(selectedOptions).length;
    const isLastQuestion = currentIndex >= total - 1;
    const allAnswered = answeredCount >= total;

    const selection = describeOptionSelection(questions[currentIndex], optNum);
    let guidance = isHindi
      ? ' आगे बढ़ने के लिए "अगला प्रश्न" बोलें, या फिर से सुनने के लिए "प्रश्न पढ़ो" कहें।'
      : ' Say "Next question" to continue or "Read question" to review.';
    if (!isHindi) {
      if (allAnswered) {
        guidance = ` All ${total} questions have been answered. Say "Submit exam" to finish and submit your test, or "Read question" to review.`;
      } else if (isLastQuestion) {
        guidance = ` This is the last question (${total} of ${total}). Say "Submit exam" to finish and submit your test, or "Previous question" or "Read question" to review.`;
      }
    }

    const reply = `${selection}${guidance}`;
    return makeReply('SELECT_OPTION', reply, `Selected Option ${optNum}`);
  }

  // ==========================================
  // 6. CLEAR OPTION
  // ==========================================
  const isClearOption =
    normalized.includes('clear') ||
    rawLower.includes('hatao') ||
    rawLower.includes('deselect') ||
    rawLower.includes('clear option') ||
    rawLower.includes('clear answer') ||
    rawLower.includes('unselect') ||
    rawLower.includes('remove answer') ||
    rawLower.includes('uttar hatao') ||
    rawLower.includes('vikalp hatao');

  if (isClearOption) {
    if (context.activeView === 'exam') {
      const state = useExamStore.getState();
      const q = state.questions[state.currentIndex];
      const hadSelection = Boolean(q && state.selectedOptions[q.id]);
      examStore.clearOption({ announce: false });
      const reply = describeClearSelection(q, hadSelection);
      return makeReply(
        'CLEAR_OPTION',
        reply,
        hadSelection ? 'Cleared selected option' : 'Nothing selected to clear'
      );
    }
  }

  // ==========================================
  // 7. NEXT QUESTION & PREVIOUS QUESTION
  // ==========================================
  if (normalized.includes('next')) {
    if (context.activeView === 'exam') {
      const { questions, currentIndex, selectedOptions } = useExamStore.getState();
      const total = questions.length;
      const isAtLast = currentIndex >= total - 1;
      const answeredCount = Object.keys(selectedOptions).length;

      if (isAtLast) {
        soundEffects.playTimerAlert();
        const reply = isHindi
          ? 'आप पहले से ही अंतिम प्रश्न पर हैं। परीक्षा समाप्त करने के लिए "सबमिट एग्जाम" बोलें।'
          : (answeredCount >= total
              ? `You have reached the end of the test. All ${total} questions have been answered. Say "Submit exam" to finish and submit your test, or "Previous question" to review.`
              : `You are on the last question (${total} of ${total}). ${total - answeredCount} questions remain unattempted. Say "Submit exam" to submit your test, or "Previous question" to review.`);
        return makeReply('NEXT_QUESTION', reply, 'At Last Question - Ready to Submit');
      }

      examStore.nextQuestion({ announce: false });
      const nextCtx = getAssistantContext();
      const q = nextCtx.currentQuestion;
      if (!q) {
        const reply = isHindi
          ? 'आप पहले से ही अंतिम प्रश्न पर हैं। परीक्षा समाप्त करने के लिए "सबमिट एग्जाम" बोलें।'
          : 'You have reached the end of the test. Say "Submit exam" when you are ready to finish.';
        return makeReply('NEXT_QUESTION', reply, 'End of Test');
      }
      const reply = buildFullQuestionSpeech(q);
      return makeReply('NEXT_QUESTION', reply, `Navigated to Question ${q.number}`);
    }
  }

  if (normalized.includes('previous')) {
    if (context.activeView === 'exam') {
      examStore.previousQuestion({ announce: false });
      const prevCtx = getAssistantContext();
      const q = prevCtx.currentQuestion;
      if (!q) {
        const reply = isHindi
          ? 'आप पहले से ही पहले प्रश्न पर हैं।'
          : 'You are already on the first question.';
        return makeReply('PREVIOUS_QUESTION', reply, 'At First Question');
      }
      const reply = buildFullQuestionSpeech(q);
      return makeReply('PREVIOUS_QUESTION', reply, `Navigated to Question ${q.number}`);
    }
  }

  // ==========================================
  // 7b. JUMP TO SPECIFIC QUESTION
  // ==========================================
  const jumpMatch =
    normalized.match(/(?:jump\s*to|go\s*to|open\s*question|question|sawal|prashna)\s*(?:number)?\s*(\d+)/i) ||
    normalized.match(/\b(\d+)(?:st|nd|rd|th)?\s*(?:question|sawal|prashna|par\s*jao|kholo)\b/i) ||
    rawTranscript.match(/(?:क्वेश्चन|सवाल|प्रश्न)\s*(?:नंबर)?\s*(\d+)/i) ||
    rawTranscript.match(/(\d+)\s*(?:नंबर)?\s*(?:क्वेश्चन|सवाल|प्रश्न|पर\s*जाओ|खोलो)/i);
  if (
    jumpMatch &&
    !normalized.includes('read') &&
    !normalized.includes('option') &&
    !normalized.includes('next') &&
    !normalized.includes('previous')
  ) {
    const targetNum = parseInt(jumpMatch[1], 10);
    if (context.activeView === 'exam' && targetNum >= 1 && targetNum <= examStore.questions.length) {
      examStore.jumpToQuestion(targetNum - 1, { announce: false });
      const jumpCtx = getAssistantContext();
      const q = jumpCtx.currentQuestion;
      if (q) {
        const reply = buildFullQuestionSpeech(q);
        return makeReply('JUMP_QUESTION', reply, `Jumped to Question ${q.number}`);
      }
    }
  }

  // ==========================================
  // 8. MARK OR UNMARK FOR REVIEW
  // ==========================================
  const isExplicitUnmark =
    rawLower.includes('unmark') ||
    rawLower.includes('remove mark') ||
    rawLower.includes('unmark review') ||
    rawLower.includes('remove review') ||
    rawLower.includes('mark hatao') ||
    rawLower.includes('review hatao') ||
    rawLower.includes('अनमार्क');

  const isMarkOrReview =
    normalized.includes('mark') ||
    normalized.includes('review') ||
    rawLower.includes('मार्क');

  if ((isExplicitUnmark || isMarkOrReview) && context.activeView === 'exam') {
    const qId = examStore.questions[examStore.currentIndex]?.id;
    const isCurrentlyMarked = qId ? Boolean(examStore.markedForReview[qId]) : false;

    if (isExplicitUnmark) {
      if (isCurrentlyMarked) {
        examStore.toggleMarkForReview();
      }
      const reply = isHindi
        ? `प्रश्न ${examStore.currentIndex + 1} से समीक्षा चिह्न हटा दिया गया है।`
        : `Question ${examStore.currentIndex + 1} has been unmarked from review.`;
      return makeReply('UNMARK_REVIEW', reply, 'Unmarked Question from Review');
    }

    // Toggle mark
    examStore.toggleMarkForReview();
    const isNowMarked = qId ? Boolean(examStore.markedForReview[qId]) : !isCurrentlyMarked;
    const reply = isHindi
      ? (isNowMarked
          ? `प्रश्न ${examStore.currentIndex + 1} समीक्षा के लिए चिह्नित कर दिया गया है।`
          : `प्रश्न ${examStore.currentIndex + 1} से समीक्षा चिह्न हटा दिया गया है।`)
      : (isNowMarked
          ? `Question ${examStore.currentIndex + 1} has been marked for review.`
          : `Question ${examStore.currentIndex + 1} has been unmarked from review.`);
    return makeReply('MARK_REVIEW', reply, isNowMarked ? 'Marked for Review' : 'Unmarked from Review');
  }

  // ==========================================
  // 9. CHECK TIME REMAINING
  // ==========================================
  if (normalized.includes('time') || rawLower.includes('samay') || rawLower.includes('waqt')) {
    if (context.activeView === 'exam' && context.currentExam) {
      const { remainingMinutes, remainingSeconds, timeRemainingFormatted } = context.currentExam;
      const reply = isHindi
        ? `आपके पास ${remainingMinutes} मिनट और ${remainingSeconds} सेकंड शेष हैं। टाइमर: ${timeRemainingFormatted}।`
        : `You have ${remainingMinutes} minutes and ${remainingSeconds} seconds remaining. Timer shows: ${timeRemainingFormatted}.`;
      return makeReply('CHECK_TIME', reply, 'Announced Remaining Time');
    } else {
      const reply = isHindi
        ? 'आप अभी किसी सक्रिय परीक्षा में नहीं हैं।'
        : 'You are not currently in an active exam. Start a test to see the timer.';
      return makeReply('CHECK_TIME', reply);
    }
  }

  // ==========================================
  // 9b. QUESTION PALETTE
  // ==========================================
  const isClosePalette =
    examStore.isPaletteOpen &&
    (
      normalized.includes('close') ||
      rawLower.includes('band') ||
      rawLower.includes('close palette') ||
      rawLower.includes('hide palette') ||
      rawLower.includes('close grid') ||
      rawLower.includes('hide grid') ||
      rawLower.includes('grid band') ||
      rawLower.includes('palette band') ||
      rawLower.includes('palette hatao')
    );

  if (isClosePalette) {
    examStore.setPaletteOpen(false);
    const reply = isHindi
      ? `प्रश्न पैलेट बंद कर दिया गया। प्रश्न ${examStore.currentIndex + 1} पर वापस आ गए हैं।`
      : `Question Palette closed. Resuming on Question ${examStore.currentIndex + 1}.`;
    return makeReply('CLOSE_PALETTE', reply, 'Closed Question Palette');
  }

  // ==========================================
  // 9c. EXAM & TEST DETAILS (Marking Scheme, Total Marks, Negative Marking, Time)
  // ==========================================
  const isTestDetailsQuery =
    rawLower.includes('test detail') ||
    rawLower.includes('exam detail') ||
    rawLower.includes('paper detail') ||
    rawLower.includes('marking scheme') ||
    rawLower.includes('negative marking') ||
    rawLower.includes('negative mark') ||
    rawLower.includes('is there negative marking') ||
    rawLower.includes('negative marking kitni') ||
    rawLower.includes('negative marking kya') ||
    rawLower.includes('total marks') ||
    rawLower.includes('total marks kitne') ||
    rawLower.includes('maximum marks') ||
    rawLower.includes('passing marks') ||
    rawLower.includes('test info') ||
    rawLower.includes('exam info') ||
    rawLower.includes('exam rules') ||
    rawLower.includes('test rules') ||
    rawLower.includes('परीक्षा विवरण') ||
    rawLower.includes('टेस्ट विवरण') ||
    rawLower.includes('मार्किंग स्कीम') ||
    rawLower.includes('नेगेटिव मार्किंग') ||
    rawLower.includes('कुल अंक');

  if (isTestDetailsQuery) {
    if (context.activeView === 'exam' && examStore.currentExam) {
      const curExam = examStore.currentExam;
      const totalQ = examStore.questions.length;
      const totalMarks = curExam.totalMarks || totalQ * 2;
      const negMarking = curExam.negativeMarking || (examStore.examMode === 'practice' ? 'No negative marking (Practice Mode)' : '-0.50 per incorrect answer');
      const remMin = Math.floor(examStore.timeRemaining / 60);
      const remSec = examStore.timeRemaining % 60;
      const sections = curExam.sections && curExam.sections.length > 0
        ? curExam.sections.join(', ')
        : 'All Sections';
      const mode = examStore.examMode === 'practice' ? 'Practice Arena' : 'Timed Examination';
      const modeHindi = examStore.examMode === 'practice' ? 'अभ्यास सत्र' : 'समयबद्ध परीक्षा';

      const reply = isHindi
        ? `परीक्षा विवरण: "${curExam.title}"। कुल ${totalQ} प्रश्न, अनुभाग: ${sections}। कुल अंक: ${totalMarks}। मार्किंग स्कीम: ${negMarking}। कुल अवधि: ${curExam.durationMinutes} मिनट, जिसमें से ${remMin} मिनट और ${remSec} सेकंड शेष हैं। परीक्षा मोड: ${modeHindi}। आप प्रश्न सुनने के लिए "प्रश्न पढ़ो" या प्रश्नों की स्थिति जानने के लिए "ओवरव्यू" बोल सकते हैं।`
        : `Exam Details for "${curExam.title}": Total ${totalQ} questions across ${sections}. Total marks: ${totalMarks}. Marking scheme: ${negMarking}. Total duration: ${curExam.durationMinutes} minutes, with ${remMin} minutes and ${remSec} seconds remaining. Mode: ${mode}. You can say "Read question" to hear the problem or say "Overview" for your attempts status.`;

      return makeReply('TEST_DETAILS', reply, 'Announced Exam Details & Marking Scheme');
    } else {
      const reply = isHindi
        ? 'आप अभी किसी सक्रिय परीक्षा में नहीं हैं। परीक्षा शुरू करने के लिए किसी भी टेस्ट का नाम बोलें।'
        : 'You are not currently in an active exam. Say the name of any test from the catalog to begin.';
      return makeReply('TEST_DETAILS', reply);
    }
  }

  // ==========================================
  // 9d. QUESTION OVERVIEW & EXAM ATTEMPTS SUMMARY
  // ==========================================
  const isOverviewOrAttemptsQuery =
    rawLower.includes('overview') ||
    rawLower.includes('question overview') ||
    rawLower.includes('exam overview') ||
    rawLower.includes('test overview') ||
    rawLower.includes('paper overview') ||
    rawLower.includes('status overview') ||
    rawLower.includes('attempts') ||
    rawLower.includes('attempt count') ||
    rawLower.includes('attempt summary') ||
    rawLower.includes('questions attempted') ||
    rawLower.includes('questions answered') ||
    rawLower.includes('how many attempt') ||
    rawLower.includes('how many questions attempted') ||
    rawLower.includes('my attempts') ||
    rawLower.includes('kitne attempt') ||
    rawLower.includes('kitne sawal attempt') ||
    rawLower.includes('kitne question attempt') ||
    rawLower.includes('kitne sawal kiye') ||
    rawLower.includes('kitne question kiye') ||
    rawLower.includes('kitne question ho gaye') ||
    rawLower.includes('kitne sawal ho gaye') ||
    rawLower.includes('kitne bache') ||
    rawLower.includes('kitne baki') ||
    rawLower.includes('kitne sawal bache') ||
    rawLower.includes('kitne question bache') ||
    rawLower.includes('test progress') ||
    rawLower.includes('exam progress') ||
    rawLower.includes('sawal status') ||
    rawLower.includes('question status') ||
    rawLower.includes('test status') ||
    rawLower.includes('exam status') ||
    rawLower.includes('ओवरव्यू') ||
    rawLower.includes('प्रयास सारांश') ||
    rawLower.includes('कितने सवाल किए') ||
    rawLower.includes('कितने प्रश्न किए') ||
    rawLower.includes('कितने सवाल बचे') ||
    rawLower.includes('कितने प्रश्न बचे') ||
    rawLower.includes('स्थिति बताओ') ||
    rawLower.includes('प्रगति बताओ');

  if (isOverviewOrAttemptsQuery && context.activeView === 'exam' && examStore.questions.length > 0) {
    const curQ = examStore.questions[examStore.currentIndex];
    const totalQ = examStore.questions.length;
    const attempted = Object.keys(examStore.selectedOptions).length;
    const unattempted = Math.max(0, totalQ - attempted);
    const marked = Object.values(examStore.markedForReview).filter(Boolean).length;
    const selectedOpt = curQ ? examStore.selectedOptions[curQ.id] : undefined;
    const isMarked = curQ ? !!examStore.markedForReview[curQ.id] : false;
    const remMin = Math.floor(examStore.timeRemaining / 60);
    const remSec = examStore.timeRemaining % 60;
    const pct = Math.round((attempted / totalQ) * 100);

    const statusStrEng = selectedOpt
      ? `Answered with Option ${selectedOpt} selected`
      : 'Unanswered';
    const markStrEng = isMarked ? ', marked for review' : '';
    const diagramNoteEng = curQ?.diagramUrl || curQ?.diagramDescription
      ? ' This question has an attached visual diagram (say "Explain diagram" to hear it).'
      : '';

    const statusStrHin = selectedOpt
      ? `उत्तर दिया गया, विकल्प ${selectedOpt} चयनित`
      : 'अनुत्तरित';
    const markStrHin = isMarked ? ', समीक्षा के लिए चिह्नित' : '';
    const diagramNoteHin = curQ?.diagramUrl || curQ?.diagramDescription
      ? ' इस प्रश्न में एक दृश्य आरेख शामिल है (विस्तार से सुनने के लिए "डायग्राम समझाओ" कहें)।'
      : '';

    const reply = isHindi
      ? `प्रश्न और प्रयास ओवरव्यू: आप अनुभाग ${curQ?.section || 'सामान्य'} के प्रश्न ${examStore.currentIndex + 1} कुल ${totalQ} में से हैं। स्थिति: ${statusStrHin}${markStrHin}।${diagramNoteHin} कुल परीक्षा प्रयास: ${attempted} के उत्तर दिए, ${unattempted} अनुत्तरित हैं, और ${marked} समीक्षा के लिए चिह्नित हैं। आपने ${remMin} मिनट शेष रहते हुए परीक्षा का ${pct}% पूरा कर लिया है। प्रश्न सुनने के लिए "प्रश्न पढ़ो" कहें या उत्तर देने के लिए "विकल्प 1 से 4" बोलें।`
      : `Question & Attempt Overview: You are on Question ${examStore.currentIndex + 1} of ${totalQ} in section ${curQ?.section || 'General'}. Status: ${statusStrEng}${markStrEng}.${diagramNoteEng} Overall test attempts: ${attempted} answered, ${unattempted} unattempted, ${marked} marked for review (${pct}% complete). Time remaining: ${remMin} minutes and ${remSec} seconds. Say "Read question" to hear the problem statement, or speak "Option 1 through 4" to select your choice.`;

    return makeReply('EXAM_OVERVIEW', reply, 'Announced Question Overview & Attempt Summary');
  }

  const isPaletteQuery =
    normalized.includes('palette') ||
    rawLower.includes('palette') ||
    rawLower.includes('pallet') ||
    rawLower.includes('palet') ||
    rawLower.includes('pelet') ||
    rawLower.includes('question grid') ||
    rawLower.includes('grid kholo') ||
    rawLower.includes('grid dikhao');

  if (isPaletteQuery) {
    if (context.activeView === 'exam' && examStore.questions.length > 0) {
      const { questions, selectedOptions, markedForReview, currentIndex } = examStore;
      const total = questions.length;
      const answeredCount = Object.keys(selectedOptions).length;
      const markedCount = Object.keys(markedForReview).filter((id) => markedForReview[id]).length;
      const leftCount = total - answeredCount;

      const shouldOpenModal =
        normalized.includes('open') ||
        normalized.includes('start') ||
        rawLower.includes('kholo') ||
        rawLower.includes('dikhao') ||
        rawLower.includes('show') ||
        rawLower.includes('grid') ||
        rawLower.includes('full palette');

      if (shouldOpenModal && !examStore.isPaletteOpen) {
        examStore.setPaletteOpen(true);
      }

      const reply = isHindi
        ? `प्रश्न पैलेट: कुल ${total} प्रश्न हैं। ${answeredCount} के उत्तर दिए, ${markedCount} समीक्षा के लिए चिह्नित हैं, ${leftCount} शेष हैं। आप अभी प्रश्न ${currentIndex + 1} पर हैं।`
        : `Question Palette: Total ${total} questions. ${answeredCount} answered, ${markedCount} marked for review, ${leftCount} left. You are currently on Question ${currentIndex + 1}.`;
      return makeReply(
        'QUESTION_PALETTE_STATUS',
        reply,
        shouldOpenModal ? 'Opened Question Palette Modal' : 'Announced Question Palette Summary'
      );
    } else {
      const reply = isHindi
        ? 'प्रश्न पैलेट केवल परीक्षा के दौरान उपलब्ध होता है।'
        : 'Question Palette is only available during an active exam. Say "Start exam" to begin a test.';
      return makeReply('NOT_IN_EXAM', reply);
    }
  }

  // ==========================================
  // 10. HINTS & SOLUTIONS (Practice Drills vs Strict Exam Integrity)
  // ==========================================
  if (
    normalized.includes('hint') ||
    normalized.includes('solution') ||
    rawLower.includes('hint') ||
    rawLower.includes('संकेत') ||
    rawLower.includes('solution') ||
    rawLower.includes('hal') ||
    rawLower.includes('हल') ||
    rawLower.includes('madad') ||
    rawLower.includes('kaise solve')
  ) {
    if (context.activeView === 'exam') {
      const isPractice = context.currentExam?.isPractice || examStore.examMode === 'practice';
      if (isPractice && examStore.questions.length > 0) {
        const curQ = examStore.questions[examStore.currentIndex];
        const isHintQuery =
          normalized.includes('hint') ||
          rawLower.includes('hint') ||
          rawLower.includes('संकेत') ||
          rawLower.includes('ishaara');

        if (isHintQuery) {
          if (curQ?.hint) {
            const hintSpeech = verbalizeForSpeech(curQ.hint);
            const reply = isHindi
              ? `प्रश्न ${examStore.currentIndex + 1} का संकेत: ${hintSpeech}। आप विकल्प 1 से 4 चुन सकते हैं।`
              : `Hint for Question ${examStore.currentIndex + 1}: ${hintSpeech}. Say Option 1 through 4 to select your answer.`;
            return makeReply('PRACTICE_HINT', reply, 'Verbalized Practice Question Hint');
          } else {
            const reply = isHindi
              ? 'इस अभ्यास प्रश्न के लिए कोई अलग संकेत उपलब्ध नहीं है। आप प्रश्न को दोबारा सुनने के लिए "प्रश्न पढ़ो" कह सकते हैं।'
              : 'No specific hint is attached to this practice drill question. You can ask me to read the question again or check the options.';
            return makeReply('PRACTICE_HINT', reply, 'No Hint Available');
          }
        } else {
          // Solution / Explanation query in Practice Mode
          if (curQ?.explanation) {
            const expSpeech = verbalizeForSpeech(curQ.explanation);
            const reply = isHindi
              ? `प्रश्न ${examStore.currentIndex + 1} का हल और स्पष्टीकरण: ${expSpeech}।`
              : `Step-by-step solution for Question ${examStore.currentIndex + 1}: ${expSpeech}.`;
            return makeReply('PRACTICE_SOLUTION', reply, 'Verbalized Step-by-Step Practice Solution');
          } else {
            const reply = isHindi
              ? 'इस प्रश्न के लिए कोई विस्तृत समाधान संलग्न नहीं है।'
              : 'No detailed solution is attached to this practice drill question.';
            return makeReply('PRACTICE_SOLUTION', reply, 'No Solution Available');
          }
        }
      }

      // Timed Exam Mode: Strictly withhold answers to protect exam integrity
      soundEffects.playTimerAlert();
      const reply = isHindi
        ? 'परीक्षा के दौरान उत्तर बताना या सवाल हल करना वर्जित है।'
        : 'Exam integrity mode is active. Solving questions and revealing answers or hints is not allowed during the live test.';
      return makeReply('EXAM_INTEGRITY_REFUSAL', reply, 'Exam Integrity Protected');
    }
  }

  // ==========================================
  // 10.5 EXAM TIMER & REMAINING TIME
  // ==========================================
  if (
    normalized.includes('timer') ||
    normalized.includes('time') ||
    rawLower.includes('samay') ||
    rawLower.includes('kitna time') ||
    rawLower.includes('kitna samay') ||
    rawLower.includes('time remaining') ||
    rawLower.includes('time left') ||
    rawLower.includes('time batao') ||
    rawLower.includes('samay batao')
  ) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      soundEffects.playSelect();
      const minutes = Math.floor(examStore.timeRemaining / 60);
      const seconds = examStore.timeRemaining % 60;
      const reply = `Time remaining: ${minutes} minutes and ${seconds} seconds. Timer display: ${examStore.formattedTime}.`;
      return makeReply('CHECK_TIMER', reply, 'Announced Remaining Time');
    }
  }

  // ==========================================
  // 11. STUDENT PERFORMANCE & ANALYTICS
  // ==========================================
  const isAnalyticsTargeted =
    context.activeView === 'analytics' ||
    normalized.includes('analytics') ||
    rawLower.includes('meri report') ||
    rawLower.includes('performance') ||
    rawLower.includes('परफॉरमेंस') ||
    rawLower.includes('student dashboard') ||
    rawLower.includes('score analytics');

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

  // Specific query: History / Recent Submissions
  if (
    isAnalyticsTargeted &&
    (rawLower.includes('history') ||
      rawLower.includes('हिस्ट्री') ||
      rawLower.includes('recent test') ||
      rawLower.includes('previous test') ||
      rawLower.includes('pichla test') ||
      rawLower.includes('pichhla test') ||
      rawLower.includes('pichle test') ||
      rawLower.includes('purane test') ||
      rawLower.includes('past test') ||
      rawLower.includes('past exam') ||
      rawLower.includes('attempts'))
  ) {
    if (a?.recentSubmissions && a.recentSubmissions.length > 0) {
      const items = a.recentSubmissions
        .slice(0, 3)
        .map(
          (s, i) =>
            isHindi
              ? `${i + 1}: ${s.examTitle}, स्कोर ${s.score}/${s.maxScore} अंक, सटीकता ${s.percentage}% (${s.correctCount} सही, ${s.incorrectCount} गलत) दिनांक ${s.date}`
              : `${i + 1}: ${s.examTitle}, score ${s.score} out of ${s.maxScore} points with ${s.percentage}% accuracy (${s.correctCount} correct, ${s.incorrectCount} wrong) on ${s.date}`
        )
        .join('. ');
      const reply = isHindi
        ? `आपके टेस्ट इतिहास में कुल ${total} टेस्ट दर्ज हैं। हालिया 3 टेस्ट: ${items}। आप "समरी सुनो" या "टेस्ट पेज पर जाओ" बोल सकते हैं।`
        : `Your test history shows ${total} total submissions. Recent 3 tests: ${items}. Say "Listen to summary" or "Back to tests".`;
      return makeReply('ANALYTICS_HISTORY', reply, 'Read Test History');
    }
  }

  // Specific query: Questions Solved (Correct vs Wrong)
  if (
    isAnalyticsTargeted &&
    (rawLower.includes('question solved') ||
      rawLower.includes('questions solved') ||
      rawLower.includes('kitne question solve') ||
      rawLower.includes('kitne sawal solve') ||
      rawLower.includes('kitne sahi') ||
      rawLower.includes('kitne galat') ||
      rawLower.includes('correct kitne') ||
      rawLower.includes('wrong kitne'))
  ) {
    const reply = isHindi
      ? `हल किए गए प्रश्नों का विवरण: आपने कुल ${qSolved} प्रश्न हल किए हैं, जिनमें ${corr} सही और ${wrong} गलत हैं।`
      : `Questions Solved Breakdown: You have solved ${qSolved} questions in total across all tests, with ${corr} correct answers and ${wrong} wrong answers.`;
    return makeReply('ANALYTICS_QUESTIONS', reply, 'Read Questions Solved Breakdown');
  }

  // Specific query: Accuracy
  if (
    isAnalyticsTargeted &&
    (rawLower.includes('accuracy') ||
      rawLower.includes('एक्यूरेसी') ||
      rawLower.includes('average accuracy') ||
      rawLower.includes('meri accuracy'))
  ) {
    const reply = isHindi
      ? `औसत सटीकता: ${total} पूर्ण किए गए टेस्टों में आपकी कुल सटीकता ${avgAcc} प्रतिशत है।`
      : `Average Accuracy: Your overall accuracy across ${total} completed tests is ${avgAcc} percent.`;
    return makeReply('ANALYTICS_ACCURACY', reply, 'Read Average Accuracy');
  }

  // Specific query: Best Score
  if (
    isAnalyticsTargeted &&
    (rawLower.includes('best score') ||
      rawLower.includes('top score') ||
      rawLower.includes('highest score') ||
      rawLower.includes('sabse accha score') ||
      rawLower.includes('sabse zyada score') ||
      rawLower.includes('बेस्ट स्कोर'))
  ) {
    const reply = isHindi
      ? `व्यक्तिगत सर्वश्रेष्ठ स्कोर: आपका उच्चतम स्कोर ${bestPct} प्रतिशत (${bestMarks} अंक) "${bestTitle}" में रहा है।`
      : `Personal Best Score: Your highest score is ${bestPct} percent (${bestMarks} points) achieved in "${bestTitle}".`;
    return makeReply('ANALYTICS_BEST_SCORE', reply, 'Read Best Score');
  }

  // Specific query: Tests Completed Count
  if (
    isAnalyticsTargeted &&
    (rawLower.includes('kitne test') ||
      rawLower.includes('kitne exam') ||
      rawLower.includes('tests completed') ||
      rawLower.includes('total test') ||
      rawLower.includes('total exam'))
  ) {
    const reply = isHindi
      ? `दिए गए टेस्ट: आपने कुल ${total} टेस्ट पूरे किए हैं, जिनमें ${timed} समयबद्ध मॉक टेस्ट और ${drills} प्रैक्टिस ड्रिल शामिल हैं।`
      : `Tests Completed: You have completed ${total} tests in total, consisting of ${timed} timed mock exams and ${drills} practice drills.`;
    return makeReply('ANALYTICS_COUNT', reply, 'Read Tests Completed Count');
  }

  // Overall Performance Summary & Real Data
  if (
    normalized.includes('analytics') ||
    rawLower.includes('meri report') ||
    rawLower.includes('performance') ||
    rawLower.includes('परफॉरमेंस') ||
    rawLower.includes('real data') ||
    rawLower.includes('रियल डेटा') ||
    rawLower.includes('data padho') ||
    rawLower.includes('data batao') ||
    rawLower.includes('data sunao') ||
    rawLower.includes('page ka data') ||
    rawLower.includes('page data') ||
    rawLower.includes('mera data') ||
    (context.activeView === 'analytics' &&
      (rawLower.includes('summary') ||
        rawLower.includes('समरी') ||
        rawLower.includes('listen to summary') ||
        rawLower.includes('score') ||
        rawLower.includes('स्कोर') ||
        rawLower.includes('result') ||
        rawLower.includes('रिजल्ट') ||
        rawLower.includes('parinaam') ||
        rawLower.includes('परिणाम'))) ||
    (context.activeView !== 'report' &&
      context.activeView !== 'exam' &&
      (normalized.includes('score') ||
        rawLower.includes('result') ||
        rawLower.includes('parinaam')))
  ) {
    if (context.activeView !== 'analytics') {
      examStore.openAnalytics();
    }
    const latestDetails = latest
      ? (isHindi
          ? ` हालिया टेस्ट "${latest.examTitle}" था जिसमें ${latest.score} अंक और ${latest.percentage}% सटीकता रही।`
          : ` Most recent test was "${latest.examTitle}" on ${latest.date}, scored ${latest.score} out of ${latest.maxScore} points with ${latest.percentage}% accuracy.`)
      : '';
    const reply = isHindi
      ? `${context.studentName} का परफॉर्मेंस सारांश: कुल ${total} टेस्ट दिए (${timed} समयबद्ध मॉक टेस्ट, ${drills} प्रैक्टिस ड्रिल)। सर्वश्रेष्ठ स्कोर: "${bestTitle}" में ${bestPct}% (${bestMarks} अंक)। औसत सटीकता: ${avgAcc}%। कुल हल प्रश्न: ${qSolved} (${corr} सही, ${wrong} गलत)।${latestDetails} आप "हिस्ट्री बताओ" या "टेस्ट पेज पर जाओ" बोल सकते हैं।`
      : `Performance Summary for ${context.studentName}: Total ${total} tests completed (${timed} timed exams, ${drills} practice drills). Best score: ${bestPct} percent (${bestMarks} points) in "${bestTitle}". Average accuracy: ${avgAcc} percent. Questions solved: ${qSolved} total (${corr} correct, ${wrong} wrong).${latestDetails} Say "History batao" or "Back to tests".`;
    return makeReply('VIEW_ANALYTICS', reply, 'Read Performance Analytics Summary');
  }

  // ==========================================
  // 12. AUDITORY GRAPH & CHART SONIFICATION
  // ==========================================
  if (
    normalized.includes('graph') ||
    normalized.includes('chart') ||
    normalized.includes('sonification') ||
    rawLower.includes('graph sunao') ||
    rawLower.includes('chart sunao') ||
    rawLower.includes('play graph') ||
    rawLower.includes('play chart') ||
    rawLower.includes('read graph') ||
    rawLower.includes('read chart') ||
    rawLower.includes('graph data') ||
    rawLower.includes('chart data')
  ) {
    if (context.activeView === 'exam' && context.currentQuestion) {
      const q = context.currentQuestion;
      if (q.graph && q.graph.enabled && q.graph.data?.length) {
        soundEffects.playSelect();
        const g = q.graph;
        const unit = g.unit ? ` ${g.unit}` : '';
        const dataList = g.data.map((d) => `${d.label}: ${d.value}${unit}`).join(', ');
        const stats = SonificationEngine.computeStats(g.data);
        const reply = isHindi
          ? `डेटा चार्ट: "${g.title || 'चार्ट'}"। इसमें ${g.data.length} डेटा बिंदु हैं: ${dataList}। सबसे अधिक मान ${stats.maxPoint?.label ?? ''} में ${stats.maxPoint?.value ?? ''}${unit} है। सबसे कम मान ${stats.minPoint?.label ?? ''} में ${stats.minPoint?.value ?? ''}${unit} है। अब ध्वनि पिच सुनी जा रही है।`
          : `Data Chart: "${g.title || 'Chart'}". It contains ${g.data.length} data points: ${dataList}. Highest value is ${stats.maxPoint?.value ?? ''}${unit} in ${stats.maxPoint?.label ?? ''}. Lowest value is ${stats.minPoint?.value ?? ''}${unit} in ${stats.minPoint?.label ?? ''}. Now playing the auditory pitch sweep.`;

        // Wait until voice finishes speaking, then play the pitch sweep cleanly
        const unsubscribe = speechEngine.onSpeechEnd(() => {
          unsubscribe();
          if (q.graph) {
            SonificationEngine.playOverviewSweep(q.graph, 0.45);
          }
        });

        return makeReply('PLAY_GRAPH', reply, 'Played Graph Sonification');
      } else {
        const reply = isHindi
          ? `प्रश्न ${q.number} में कोई डेटा ग्राफ नहीं है।`
          : `Question ${q.number} does not contain a data graph.`;
        return makeReply('NO_GRAPH', reply);
      }
    }
  }

  // ==========================================
  // 13. REPORT SCREEN SPECIFIC ACTIONS (Summary, Retake, Explain Result)
  // ==========================================
  if (context.activeView === 'report' || examStore.isSubmitted) {
    if (
      rawLower.includes('summary') ||
      rawLower.includes('समरी') ||
      rawLower.includes('score') ||
      rawLower.includes('स्कोर') ||
      rawLower.includes('result') ||
      rawLower.includes('रिजल्ट') ||
      rawLower.includes('analytics') ||
      rawLower.includes('एनालिटिक्स') ||
      rawLower.includes('report') ||
      rawLower.includes('रिपोर्ट') ||
      rawLower.includes('performance') ||
      rawLower.includes('parinam') ||
      rawLower.includes('marks') ||
      rawLower.includes('kitne sahi') ||
      rawLower.includes('kitne number') ||
      rawLower.includes('kitna score') ||
      rawLower.includes('explain result') ||
      rawLower.includes('explain report') ||
      rawLower.includes('explain analytics') ||
      rawLower.includes('kaisa raha') ||
      rawLower.includes('result batao') ||
      rawLower.includes('score batao') ||
      rawLower.includes('analytics batao')
    ) {
      soundEffects.playSelect();
      const rep = context.diagnosticReport || examStore.getDiagnosticReport();
      const summaryText =
        rep?.verbalSummary?.join(' ') ||
        (isHindi
          ? `कुल स्कोर: ${rep?.maxScore || 0} में से ${rep?.totalScore || 0} अंक (${rep?.scorePercentage || 0}%)। प्रयास किए गए: ${rep?.attemptedCount || 0} प्रश्न (${rep?.correctCount || 0} सही, ${rep?.incorrectCount || 0} गलत)। शेष: ${rep?.unattemptedCount || 0}।`
          : `Overall Score: ${rep?.totalScore || 0} out of ${rep?.maxScore || 0} points (${rep?.scorePercentage || 0}%). Attempted: ${rep?.attemptedCount || 0} questions (${rep?.correctCount || 0} correct, ${rep?.incorrectCount || 0} incorrect). Unattempted: ${rep?.unattemptedCount || 0}.`);
      const reply = isHindi
        ? `"${rep?.examTitle || 'परीक्षा'}" का प्रदर्शन डायग्नोस्टिक और एनालिटिक्स रिपोर्ट: आपने ${rep?.maxScore || 0} में से ${rep?.totalScore || 0} अंक प्राप्त किए, जो कि ${rep?.scorePercentage || 0} प्रतिशत है। ${summaryText} आप "दोबारा टेस्ट दें" या "दूसरा एग्जाम चुनें" कह सकते हैं।`
        : `Performance Diagnostic and Analytics Report for "${rep?.examTitle || 'Exam'}": You scored ${rep?.totalScore || 0} out of ${rep?.maxScore || 0} points, which is ${rep?.scorePercentage || 0} percent. ${summaryText} You can say "Retake test" or "Choose another exam".`;
      return makeReply('READ_REPORT_SUMMARY', reply, 'Explained Diagnostic & Analytics Report');
    }

    if (
      rawLower.includes('retake') ||
      rawLower.includes('रीटेक') ||
      rawLower.includes('dobara') ||
      rawLower.includes('fir se') ||
      rawLower.includes('again')
    ) {
      examStore.resetExam();
      const reply = isHindi
        ? 'परीक्षा रीसेट कर दी गई है। प्रश्न 1 स्क्रीन पर लोड हो चुका है। शुरू करने के लिए "प्रश्न पढ़ो" बोलें।'
        : 'Exam has been reset. Question 1 is now loaded. Say "Read question" to begin.';
      return makeReply('RETAKE_EXAM', reply, 'Retook Exam');
    }
  }

  // ==========================================
  // 14. EXAM FEEDBACK COMMANDS (Voice & Accessibility)
  // ==========================================
  const isFeedbackContext = context.activeView === 'report' || examStore.feedback?.isOpen;
  if (isFeedbackContext) {
    // 1. Submit Feedback (Explicit submit feedback intent)
    const isSubmitFeedbackExplicit =
      rawLower.includes('submit feedback') ||
      rawLower.includes('feedback submit') ||
      rawLower.includes('फीडबैक सबमिट') ||
      rawLower.includes('सबमिट फीडबैक') ||
      rawLower.includes('फीडबैक जमा') ||
      (examStore.feedback?.isOpen &&
        (rawLower === 'submit' ||
          rawLower === 'सबमिट' ||
          rawLower === 'confirm submit' ||
          rawLower === 'सबमिट करो' ||
          rawLower === 'जमा करो'));

    if (isSubmitFeedbackExplicit) {
      if (examStore.feedback.rating === 0) {
        const reply = isHindi
          ? 'कृपया सबमिट करने से पहले स्टार रेटिंग चुनें।'
          : 'Please select a star rating before submitting.';
        return makeReply('FEEDBACK_RATING_REQUIRED', reply, 'Rating Required');
      }
      examStore.closeFeedbackModal();
      examStore.submitExamFeedback();
      const reply = isHindi ? 'आपका फीडबैक सफलतापूर्वक सबमिट कर दिया गया है। धन्यवाद!' : 'Your feedback has been submitted successfully. Thank you!';
      return makeReply('SUBMIT_FEEDBACK', reply, 'Submitted Feedback');
    }

    // 2. Skip or Close Feedback
    if (
      (rawLower.includes('skip') || rawLower.includes('स्किप') || rawLower.includes('बंद') || rawLower.includes('close') || rawLower.includes('हटाओ')) &&
      (rawLower.includes('feedback') || rawLower.includes('फीडबैक') || examStore.feedback?.isOpen)
    ) {
      examStore.skipExamFeedback();
      const reply = isHindi ? 'फीडबैक छोड़ दिया गया है।' : 'Feedback closed.';
      return makeReply('SKIP_FEEDBACK', reply, 'Skipped Feedback');
    }

    // 3. Star Rating Selection (1 to 5 stars) - Guard against prompt range echoes
    const isRangePhrase =
      rawLower.includes('1 to 5') ||
      rawLower.includes('1 se 5') ||
      rawLower.includes('1-5') ||
      rawLower.includes('1 से 5') ||
      rawLower.includes('one to five');

    let starNumber = 0;
    if (!isRangePhrase) {
      const starMatch =
        rawLower.match(/(?:rating|रेटिंग)\s*([1-5])/i) ||
        rawLower.match(/([1-5])\s*(?:star|stars|स्टार)/i);

      if (starMatch && starMatch[1]) {
        starNumber = parseInt(starMatch[1], 10);
      } else if (rawLower.includes('पांच स्टार') || rawLower.includes('पाँच स्टार') || rawLower.includes('five star') || rawLower.includes('5 star')) {
        starNumber = 5;
      } else if (rawLower.includes('चार स्टार') || rawLower.includes('four star') || rawLower.includes('4 star')) {
        starNumber = 4;
      } else if (rawLower.includes('तीन स्टार') || rawLower.includes('three star') || rawLower.includes('3 star')) {
        starNumber = 3;
      } else if (rawLower.includes('दो स्टार') || rawLower.includes('two star') || rawLower.includes('2 star')) {
        starNumber = 2;
      } else if (rawLower.includes('एक स्टार') || rawLower.includes('one star') || rawLower.includes('1 star')) {
        starNumber = 1;
      }
    }

    if (starNumber >= 1 && starNumber <= 5) {
      examStore.setFeedbackRating(starNumber, 'voice');
      if (!examStore.feedback.isOpen && !examStore.feedback.isSubmitted) {
        examStore.openFeedbackModal();
      }
      const reply = isHindi
        ? `रेटिंग ${starNumber} स्टार दर्ज कर दी गई है। आप अपनी टिप्पणी बोल सकते हैं या सबमिट करने के लिए कह सकते हैं।`
        : `Rating recorded as ${starNumber} stars. You can dictate additional comments or say confirm submission.`;
      return makeReply('SET_FEEDBACK_RATING', reply, `Rated ${starNumber} Stars`);
    }

    // 4. Open Feedback Window (Explicit open/rate intents only; never re-open if already submitted)
    const isOpenFeedbackCommand =
      rawLower.includes('open feedback') ||
      rawLower.includes('give feedback') ||
      rawLower.includes('share feedback') ||
      rawLower.includes('rate exam') ||
      rawLower.includes('फीडबैक खोलो') ||
      rawLower.includes('फीडबैक दो') ||
      rawLower.includes('फीडबैक देना') ||
      rawLower.includes('रेटिंग दो') ||
      rawLower.includes('रेटिंग देना') ||
      rawLower.includes('feedback kholo') ||
      rawLower.includes('feedback do');

    if (!examStore.feedback?.isOpen && !examStore.feedback?.isSubmitted && isOpenFeedbackCommand) {
      examStore.openFeedbackModal();
      const reply = isHindi
        ? 'परीक्षा फीडबैक विंडो खुल चुकी है। आप अपना अनुभव और स्टार रेटिंग दर्ज कर सकते हैं।'
        : 'Exam feedback window is now open. You can provide your star rating and comments.';
      return makeReply('OPEN_FEEDBACK', reply, 'Opened Feedback Modal');
    }

    // 5. Edit/Reopen Feedback Window if already submitted
    const isEditFeedbackCommand =
      rawLower.includes('edit feedback') ||
      rawLower.includes('change feedback') ||
      rawLower.includes('update feedback') ||
      rawLower.includes('reopen feedback') ||
      rawLower.includes('फीडबैक बदलो') ||
      rawLower.includes('फीडबैक एडिट') ||
      rawLower.includes('फीडबैक दोबारा');

    if (examStore.feedback?.isSubmitted && isEditFeedbackCommand) {
      examStore.openFeedbackModal(true);
      const reply = isHindi
        ? 'फीडबैक विंडो दोबारा खुल गई है। आप अपनी रेटिंग या टिप्पणी बदल सकते हैं।'
        : 'Feedback window reopened. You can update your rating or comments.';
      return makeReply('EDIT_FEEDBACK', reply, 'Reopened Feedback Modal');
    }
  }



  // ==========================================
  // 15. SUBMIT EXAM (OPEN CONFIRMATION WINDOW)
  // ==========================================
  if (
    normalized.includes('submit') ||
    rawLower.includes('jama') ||
    rawLower.includes('finish exam') ||
    rawLower.includes('end exam')
  ) {
    if (context.activeView === 'exam' && !examStore.isSubmitted) {
      examStore.setSubmitModalOpen(true);
      soundEffects.playTimerAlert();
      const total = examStore.questions.length;
      const answered = Object.keys(examStore.selectedOptions).length;
      const reply = isHindi
        ? 'परीक्षा सबमिट करने की पुष्टि विंडो खुल गई है। समाप्त करने के लिए कन्फर्म करें, या वापस जाने के लिए Escape दबाएँ।'
        : `Confirm exam submission window is open. You have answered ${answered} of ${total} questions. Say "Yes, Final Submit" or press Enter to submit, or say "Continue to Exam" or press Escape to resume your test.`;
      return makeReply('CONFIRM_SUBMIT', reply, 'Opened Submit Modal');
    }
  }

  // ==========================================
  // 16. EXPLAIN CURRENT PAGE (Grounded)
  // ==========================================
  if (
    normalized.includes('explain_page') ||
    rawLower.includes('kis page') ||
    rawLower.includes('किस पेज') ||
    rawLower.includes('कौन सा पेज') ||
    rawLower.includes('कौनसा पेज') ||
    rawLower.includes('यह कौन सा') ||
    rawLower.includes('ये कौन सा') ||
    rawLower.includes('which page') ||
    rawLower.includes('where am i') ||
    rawLower.includes('kahan hoon') ||
    rawLower.includes('kahan par hoon') ||
    rawLower.includes('kaun sa page') ||
    rawLower.includes('kaunse page') ||
    rawLower.includes('konsa page') ||
    rawLower.includes('current page') ||
    rawLower.includes('ye kaunsa page hai') ||
    rawLower.includes('is page par kya hai') ||
    rawLower.includes('yahan kya kar sakte hain') ||
    rawLower.includes('kya chal raha hai') ||
    rawLower.includes('explain page') ||
    rawLower.includes('कहाँ हूँ') ||
    rawLower.includes('कहाँ पर हूँ') ||
    rawLower.includes('यह क्या है') ||
    rawLower.includes('स्क्रीन समझाओ') ||
    rawLower.includes('पेज समझाओ')
  ) {
    if (context.activeView === 'report') {
      const rep = context.diagnosticReport;
      const examTitle = rep?.examTitle || context.currentExam?.title || 'Mock Examination';
      const score = rep?.totalScore ?? 0;
      const maxScore = rep?.maxScore ?? 20;
      const pct = rep?.scorePercentage ?? 0;
      const reply = isHindi
        ? `आपने "${examTitle}" सफलतापूर्वक पूरी करके सबमिट कर दी है। आप अभी डायग्नोस्टिक रिपोर्ट और परफॉर्मेंस विश्लेषण स्क्रीन पर हैं। आपका स्कोर ${maxScore} में से ${score} (${pct}%) है। आप "समरी पढ़ो", "दोबारा टेस्ट दो" या "मॉक टेस्ट पेज पर जाओ" बोल सकते हैं।`
        : `You have completed and submitted "${examTitle}". You are currently on the Diagnostic Report & Performance Analysis screen. Your score is ${score} out of ${maxScore} (${pct}%). Say "Read summary", "Retake test", or "Go to mock test page".`;
      return makeReply('EXPLAIN_PAGE', reply, 'Explained Diagnostic Report');
    } else if (context.activeView === 'catalog') {
      const isPractice = context.portalTab === 'practice';
      const reply = isHindi
        ? (isPractice
            ? `आप अभी दृष्टिएक्स प्रैक्टिस एरिना डैशबोर्ड पर हैं। यहाँ संकेत और समाधान के साथ कुल ${context.availableDrills.length} अभ्यास उपलब्ध हैं।`
            : `आप अभी दृष्टिएक्स मॉक टेस्ट श्रृंखला कैटलॉग पर हैं। यहाँ कुल ${context.availableExams.length} मॉक परीक्षाएं उपलब्ध हैं। शुरू करने के लिए टेस्ट का नाम बोलें।`)
        : (isPractice
            ? `You are currently on the DristiX Practice Arena & Skill Drills dashboard. There are ${context.availableDrills.length} practice drills available with hints and solutions.`
            : `You are currently on the DristiX Examination & Mock Test Series catalog. There are ${context.availableExams.length} full-length mock exams available. Say "Start SSC CGL" or "Start Exam 1" to begin.`);
      return makeReply('EXPLAIN_PAGE', reply, 'Explained Catalog Page');
    } else if (context.activeView === 'exam') {
      const q = context.currentQuestion;
      const isPractice = context.currentExam?.isPractice;
      const examTitle = context.currentExam?.title || 'Mock Examination';
      const reply = isHindi
        ? `आप अभी "${examTitle}" ${isPractice ? 'प्रैक्टिस ड्रिल' : 'लाइव मॉक परीक्षा'} दे रहे हैं, प्रश्न ${context.currentExam?.totalQuestions || 10} में से प्रश्न ${q?.number || 1} पर हैं। शेष समय: ${context.currentExam?.timeRemainingFormatted}। प्रश्न सुनने के लिए "प्रश्न पढ़ो" बोलें।`
        : `You are currently taking "${examTitle}" ${isPractice ? 'Practice Drill' : 'Live Mock Examination'}, on Question ${q?.number || 1} of ${context.currentExam?.totalQuestions || 10}. Remaining time: ${context.currentExam?.timeRemainingFormatted}. Say "Read question" to hear the question and options.`;
      return makeReply('EXPLAIN_PAGE', reply, 'Explained Exam Page');
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
      const reply = isHindi
        ? `आप अपने परफॉर्मेंस और स्कोर एनालिटिक्स डैशबोर्ड पर हैं। कुल ${total} टेस्ट दिए हैं (${timed} समयबद्ध टेस्ट, ${drills} प्रैक्टिस ड्रिल)। सर्वश्रेष्ठ स्कोर: "${bestTitle}" में ${bestPct}% (${bestMarks} अंक)। औसत सटीकता: ${avgAcc}%। कुल हल प्रश्न: ${qSolved} (${corr} सही, ${wrong} गलत)। आप "समरी सुनो", "हिस्ट्री बताओ" या "टेस्ट पेज पर जाओ" बोल सकते हैं।`
        : `You are on your Performance & Score Analytics Dashboard. Real data recorded: ${total} tests completed (${timed} timed exams, ${drills} practice drills). Best score is ${bestPct}% (${bestMarks} points) in "${bestTitle}". Average accuracy is ${avgAcc}%. Total questions solved: ${qSolved} (${corr} correct, ${wrong} wrong). Say "Listen to summary", "History batao", or "Back to tests".`;
      return makeReply('EXPLAIN_PAGE', reply, 'Explained Analytics Page');
    }
  }

  // ==========================================
  // 17. GENERAL CONVERSATION & GREETING
  // ==========================================
  if (
    rawLower.includes('namaste') ||
    rawLower.includes('नमस्ते') ||
    rawLower.includes('hello') ||
    rawLower.includes('hlo') ||
    rawLower.includes('hey') ||
    rawLower.includes('hi') ||
    rawLower.includes('हेलो') ||
    rawLower.includes('हाय')
  ) {
    const reply = isHindi
      ? `नमस्ते ${context.studentName}! मैं दृष्टिएक्स का वॉइस असिस्टेंट हूँ। मैं टेस्ट शुरू करने, प्रश्न पढ़ने और विकल्प चुनने में आपकी सहायता कर सकता हूँ। मैं आपकी क्या मदद करूँ?`
      : `Hello ${context.studentName}! I am the DristiX Conversational AI Voice Assistant. I can list available exams, start tests, read questions, and select options on your command. How can I help you?`;
    return makeReply('GREETING', reply);
  }

  if (
    rawLower.includes('aap kaun ho') ||
    rawLower.includes('tum kaun ho') ||
    rawLower.includes('आप कौन हो') ||
    rawLower.includes('who are you')
  ) {
    const reply = isHindi
      ? 'मैं दृष्टिएक्स सुगम्य एआई सहायक हूँ, जो दृष्टिबाधित और प्रतियोगी परीक्षा के छात्रों के लिए आवाज़ से टेस्ट देने में मदद करता है।'
      : 'I am the DristiX Accessible AI Assistant, built specifically for visually impaired and competitive exam candidates to conduct tests and assist hands-free with voice commands.';
    return makeReply('IDENTITY', reply);
  }

  if (
    rawLower.includes('thank') ||
    rawLower.includes('dhanyawad') ||
    rawLower.includes('dhanyavaad') ||
    rawLower.includes('धन्यवाद') ||
    rawLower.includes('shukriya') ||
    rawLower.includes('शुक्रिया')
  ) {
    const reply = isHindi
      ? `आपका बहुत-बहुत स्वागत है ${context.studentName}! यदि आपको कोई और सहायता चाहिए तो कृपया बताएं।`
      : `You're welcome, ${context.studentName}! Let me know whenever you need any further assistance.`;
    return makeReply('COURTESY', reply);
  }

  if (
    rawLower.includes('goodbye') ||
    rawLower.includes('bye') ||
    rawLower.includes('alvida') ||
    rawLower.includes('अलविदा')
  ) {
    const reply = isHindi
      ? `अलविदा ${context.studentName}! आपकी परीक्षा की तैयारी के लिए शुभकामनाएँ।`
      : `Goodbye ${context.studentName}! Best of luck with your examination preparations.`;
    return makeReply('COURTESY', reply);
  }

  if (
    rawLower.includes('what can you do') ||
    rawLower.includes('kya kar sakte ho') ||
    rawLower.includes('kya kya kar sakte ho') ||
    rawLower.includes('क्या कर सकते हो') ||
    rawLower.includes('features') ||
    rawLower.includes('suvidha')
  ) {
    const reply = isHindi
      ? `मैं दृष्टिएक्स पर आपके पूरे टेस्ट का संचालन कर सकता हूँ। आप "मॉक टेस्ट लिस्ट बताओ", "एसएससी सीजीएल शुरू करो", "प्रश्न पढ़ो", "विकल्प 1 चुनो", "अगला सवाल", "समय बताओ" या "थीम बदलो" बोल सकते हैं।`
      : `I can fully guide and operate your tests on DristiX hands-free. You can say "List available exams", "Start SSC CGL", "Read question", "Select Option 1", "Next question", "Check timer", or "Change theme".`;
    return makeReply('CAPABILITIES', reply);
  }

  // If the query was detected as a phantom noise or hallucination, NEVER blurt out a fallback or speak!
  if (isPhantomNoise(rawTranscript)) {
    return {
      success: false,
      intent: 'UNRECOGNIZED',
      userQuery: rawTranscript,
      assistantReply: '',
      actionExecuted: undefined,
    };
  }

  const fallbackReply = isHindi
    ? (context.activeView === 'exam'
        ? `मैं सुन रहा हूँ। आप प्रश्न ${context.currentQuestion?.number || 1} के लिए "प्रश्न पढ़ो", "सवाल समझाओ", 1 से 4 तक विकल्प चुन सकते हैं, "अगला सवाल", या "समय बताओ" कह सकते हैं।`
        : context.activeView === 'catalog'
        ? `मैं सुन रहा हूँ। आप मुझे कोई भी मॉक टेस्ट शुरू करने, टेस्ट सूची सुनने, या नोटिफिकेशन देखने के लिए कह सकते हैं।`
        : context.activeView === 'report'
        ? `मैं सुन रहा हूँ। आप अपनी परीक्षा समरी सुनने, दोबारा टेस्ट देने या टेस्ट कैटलॉग पर वापस जाने के लिए कह सकते हैं।`
        : `मैं सुन रहा हूँ। आप मुझसे परीक्षा शुरू करने, प्रश्न पढ़ने या नेविगेशन के लिए कह सकते हैं।`)
    : (context.activeView === 'exam'
        ? `I am listening. For Question ${context.currentQuestion?.number || 1}, you can say "Read question", "Explain question", choose an option 1 to 4, say "Next question", or check the time.`
        : context.activeView === 'catalog'
        ? `I am listening. You can tell me which mock test to start, ask to list available tests, or open notifications.`
        : context.activeView === 'report'
        ? `I am listening. You can ask to read the score summary, retake this test, or return to the tests catalog.`
        : `I am listening. You can tell me what you would like to do, such as starting a test or navigating.`);
  return makeReply('FALLBACK', fallbackReply, undefined, false);
}

/**
 * High-accuracy multi-candidate processor with clause extraction for trailing noise resilience
 */
export function processVoiceCommand(
  rawTranscriptOrAlternatives: string | string[]
): CommandProcessResult {
  const initialCandidates: string[] = Array.isArray(rawTranscriptOrAlternatives)
    ? rawTranscriptOrAlternatives
    : [rawTranscriptOrAlternatives];

  const candidates: string[] = [];

  for (const c of initialCandidates) {
    const trimmed = c.trim();
    if (!trimmed || isPhantomNoise(trimmed)) continue;
    if (!candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }

    // Extract leading sentence/clause if trailing background talk was appended
    // Split by punctuation (Devanagari danda ।, question mark ?, period ., exclamation !, newline)
    const clauses = trimmed.split(/[।?!.\n\r]+/).map((s) => s.trim()).filter(Boolean);
    if (clauses.length > 1) {
      const firstClause = clauses[0];
      if (firstClause && !candidates.includes(firstClause) && !isPhantomNoise(firstClause)) {
        candidates.push(firstClause);
      }
    }

    // Evaluate full candidate phrase to preserve exact test names and task intent without corruptive truncation
  }

  let bestResult: CommandProcessResult | null = null;

  // Search through all alternatives from SpeechRecognition engine without interim announcements
  for (const transcript of candidates) {
    if (!transcript.trim()) continue;
    const res = executeCommand(transcript, false);
    if (res.intent !== 'FALLBACK' && res.intent !== 'UNRECOGNIZED') {
      bestResult = res;
      // Use the clean matched phrase as the userQuery so trailing room noise doesn't clutter chat
      bestResult.userQuery = transcript;
      break; // Immediate high-confidence match!
    }
    if (!bestResult) {
      bestResult = res;
    }
  }

  const finalResult = bestResult || executeCommand(candidates[0] || initialCandidates[0] || '', false);

  // Only announce if a real valid command succeeded!
  // 'FALLBACK' or 'UNRECOGNIZED' should NEVER be blurted out by the local runner,
  // allowing the conversational LLM or the explicit fallback to handle it.
  if (
    finalResult.success &&
    finalResult.intent !== 'FALLBACK' &&
    finalResult.intent !== 'UNRECOGNIZED' &&
    finalResult.assistantReply
  ) {
    useAnnouncerStore.getState().announce(finalResult.assistantReply, 'assertive', true);
  }
  return finalResult;
}
