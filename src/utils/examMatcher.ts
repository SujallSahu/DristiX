import type { Exam } from '../../shared/types';

/**
 * Universal High-Accuracy Dynamic Exam Matcher.
 * Matches:
 * 1. Exact model parameter (ID, Code, Title)
 * 2. Exact Full Title or Cleaned Core Title in Query
 * 3. Specific Differentiators (e.g. "10+2", "10 plus 2", "12", "Sprint", "Science")
 * 4. Dynamic Numerical Position & Ordinal Matching (Exam 6, 6th Test, "6 number wala", "chhatha")
 * 5. High-specificity Multi-candidate Scoring so general keywords (like "RRB") do NOT shadow specific exams.
 */
export function matchExamFromQuery(
  rawQuery: string,
  param: string | number | null | undefined,
  allExams: Exam[]
): Exam | null {
  if (!allExams || allExams.length === 0) return null;

  const raw = (rawQuery || '').trim();
  const p = String(param || '').toLowerCase().trim();

  // 1. Direct ID / Code / Exact Title Match from Model Parameter
  if (p && p !== 'null' && p !== 'undefined') {
    const directMatch = allExams.find(
      (e) =>
        e.id.toLowerCase() === p ||
        e.code.toLowerCase() === p ||
        e.title.toLowerCase() === p
    );
    if (directMatch) return directMatch;
  }

  // Normalize Devanagari numerals to ASCII digits
  let query = raw
    .toLowerCase()
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

  // Normalize "10+2" variations (10+2, 10 + 2, 10 plus 2, ten plus two, 10प्लस2)
  query = query
    .replace(/\b10\s*[\+\-]\s*2\b/g, '10+2')
    .replace(/\b10\s*plus\s*2\b/gi, '10+2')
    .replace(/\bten\s*plus\s*two\b/gi, '10+2')
    .replace(/\b10\s*प्लस\s*2\b/gi, '10+2')
    .replace(/\b10\s*2\b/g, '10+2');

  // Hindi & Devanagari Acronym & Term Transliterations
  query = query
    .replace(/(?:एसएससी|एस\.एस\.सी|एस\s*एस\s*सी)/gi, 'ssc')
    .replace(/(?:सीजीएल|सी\.जी\.एल|सी\s*जी\s*एल)/gi, 'cgl')
    .replace(/(?:आरआरबी|आर\.आर\.बी|आर\s*आर\s*बी)/gi, 'rrb')
    .replace(/(?:एनटीपीसी|एन\.टी\.पी\.सी|एन\s*टी\s*पी\s*सी)/gi, 'ntpc')
    .replace(/(?:यूपीएससी|यू\.पी\.एस\.सी|यू\s*पी\s*एस\s*सी)/gi, 'upsc')
    .replace(/(?:सीसैट|सी\s*सैट|सीसेट)/gi, 'csat')
    .replace(/(?:आईबीपीएस|आई\.बी\.पी\.एस|आई\s*बी\s*पी\s*एस)/gi, 'ibps')
    .replace(/(?:पीओ|पी\.ओ|पी\s*ओ)/gi, 'po')
    .replace(/(?:रेलवे|रेलवेज)/gi, 'railway')
    .replace(/(?:सिविल\s*सेवा|सिविल\s*सर्विसेज)/gi, 'civil services')
    .replace(/(?:क्वांटिटेटिव|क्वांट)/gi, 'quantitative')
    .replace(/(?:लॉजिकल|तर्कशक्ति|रीजनिंग)/gi, 'reasoning')
    .replace(/(?:वर्बल\s*एबिलिटी|शब्दावली|वर्बल)/gi, 'verbal')
    .replace(/(?:जनरल\s*अवेयरनेस|सामान्य\s*ज्ञान|जीके)/gi, 'general awareness')
    .replace(/(?:डेटा\s*इंटरप्रिटेशन|आंकड़ा\s*निर्वचन)/gi, 'data interpretation');

  const combined = `${p} ${query}`.toLowerCase();

  // 2. Direct Substring ID or Code Match in User Query
  for (const exam of allExams) {
    const idLower = exam.id.toLowerCase();
    const codeLower = exam.code.toLowerCase();
    const codeHyphenless = codeLower.replace(/[-_\s]+/g, '');
    const combinedHyphenless = combined.replace(/[-_\s]+/g, '');

    if (
      combined.includes(idLower) ||
      (codeLower.length >= 3 && combined.includes(codeLower)) ||
      (codeHyphenless.length >= 3 && combinedHyphenless.includes(codeHyphenless))
    ) {
      return exam;
    }
  }

  // 3. Exact Full Title or Cleaned Core Title Match
  const commonBoilerplate = /\b(mock|test|exam|examination|series|paper|drill|practice|full|tier|tier-1|tier-2|2024|2025|2026|set\s*[a-z0-9]?)\b/gi;

  for (const exam of allExams) {
    const titleLower = exam.title.toLowerCase();
    const titleNormalized = titleLower
      .replace(/\b10\s*[\+\-]\s*2\b/g, '10+2')
      .replace(/\b10\s*plus\s*2\b/gi, '10+2');

    if (combined.includes(titleLower) || combined.includes(titleNormalized)) {
      return exam;
    }

    const coreTitle = titleNormalized.replace(commonBoilerplate, '').replace(/\s+/g, ' ').trim();
    if (coreTitle.length >= 3 && combined.includes(coreTitle)) {
      return exam;
    }
  }

  // 4. Explicit Index / Ordinal Matching (e.g. Exam 6, 6th Test, "6 number", "chhatha", "open 6")
  let extractedTargetIdx: number | null = null;

  // Patterns like "exam 6", "test 6", "number 6", "no 6", "open 6", "start 6", "टेस्ट 1", "एग्जाम 1", "ड्रिल 1"
  const prefixNumMatch = combined.match(/(?:exam|test|drill|number|no\.?|open|start|kholo|chalao|shuru|टेस्ट|एग्जाम|ड्रिल|परीक्षा|नंबर|नम्बर)\s*(\d+)/i);
  if (prefixNumMatch && prefixNumMatch[1]) {
    extractedTargetIdx = parseInt(prefixNumMatch[1], 10) - 1;
  }

  // Patterns like "6th exam", "6th test", "6th", "6th wala", "6 number", "6 no", "6 wala"
  if (extractedTargetIdx === null) {
    const suffixNumMatch = combined.match(/\b(\d+)\s*(?:st|nd|rd|th|number|no\.?|wala|waala|valaa|vala|waale|number\s*wala|number\s*vala)\b/i);
    if (suffixNumMatch && suffixNumMatch[1]) {
      extractedTargetIdx = parseInt(suffixNumMatch[1], 10) - 1;
    }
  }

  // Ordinal words in English and Hindi (1-indexed converted to 0-indexed)
  if (extractedTargetIdx === null) {
    const ordinalWordMap: { [key: string]: number } = {
      pehla: 0,
      pehli: 0,
      first: 0,
      '1st': 0,
      'पहला': 0,
      'पहिला': 0,
      'पहली': 0,
      dusra: 1,
      doosra: 1,
      dusri: 1,
      second: 1,
      '2nd': 1,
      'दूसरा': 1,
      'दुसरा': 1,
      'दूसरी': 1,
      teesra: 2,
      teesri: 2,
      third: 2,
      '3rd': 2,
      'तीसरा': 2,
      'तीसरी': 2,
      chautha: 3,
      chauthi: 3,
      fourth: 3,
      '4th': 3,
      'चौथा': 3,
      'चौथी': 3,
      paanchwa: 4,
      panchwa: 4,
      fifth: 4,
      '5th': 4,
      'पांचवां': 4,
      'पाँचवाँ': 4,
      'पांचवी': 4,
      'पाँचवीं': 4,
      chhatha: 5,
      chhatwa: 5,
      chatha: 5,
      chhattha: 5,
      chhatthi: 5,
      sixth: 5,
      '6th': 5,
      'छठा': 5,
      'छठवां': 5,
      'छठी': 5,
      saatwa: 6,
      satwa: 6,
      seventh: 6,
      '7th': 6,
      'सातवां': 6,
      'सातवीं': 6,
      aathwa: 7,
      athwa: 7,
      eighth: 7,
      '8th': 7,
      'आठवां': 7,
      'आठवीं': 7,
      nauwa: 8,
      ninth: 8,
      '9th': 8,
      'नौवां': 8,
      'नौवीं': 8,
      daswa: 9,
      tenth: 9,
      '10th': 9,
      'दसवां': 9,
      'दसवीं': 9,
    };

    for (const [word, idx] of Object.entries(ordinalWordMap)) {
      const isDevanagari = /[\u0900-\u097F]/.test(word);
      const matched = isDevanagari
        ? combined.includes(word)
        : new RegExp(`\\b${word}\\b`, 'i').test(combined);
      if (matched) {
        extractedTargetIdx = idx;
        break;
      }
    }
  }

  // Hindi number words before "number", "wala", "exam", "test", "drill"
  if (extractedTargetIdx === null) {
    const hindiNumWords: { [key: string]: number } = {
      ek: 0,
      'एक': 0,
      do: 1,
      'दो': 1,
      teen: 2,
      'तीन': 2,
      char: 3,
      'चार': 3,
      paanch: 4,
      panch: 4,
      'पांच': 4,
      'पाँच': 4,
      chhe: 5,
      chhah: 5,
      che: 5,
      'छह': 5,
      'छे': 5,
      saat: 6,
      'सात': 6,
      aath: 7,
      'आठ': 7,
      nau: 8,
      'नौ': 8,
      das: 9,
      'दस': 9,
    };

    for (const [w, idx] of Object.entries(hindiNumWords)) {
      const isDevanagari = /[\u0900-\u097F]/.test(w);
      const pattern = isDevanagari
        ? new RegExp(`${w}\\s*(?:नंबर|नम्बर|वाला|टेस्ट|एग्जाम|परीक्षा|परीक्षण|ड्रिल|kholo|chalao|shuru|number|no|wala|vala|exam|test|drill)`, 'i')
        : new RegExp(`\\b${w}\\s*(?:number|no|wala|vala|exam|test|drill|kholo|chalao|shuru)\\b`, 'i');
      if (pattern.test(combined)) {
        extractedTargetIdx = idx;
        break;
      }
    }
  }

  // 5. Multi-candidate Specificity Scoring
  // Assign a relevance score to every exam.
  // The exam with the highest specificity score wins.
  let bestExam: Exam | null = null;
  let highestScore = 0;

  for (let idx = 0; idx < allExams.length; idx++) {
    const exam = allExams[idx];
    let score = 0;

    const titleLower = exam.title.toLowerCase();
    const codeLower = exam.code.toLowerCase();

    // If explicit index matches this exam, add a huge boost (+80)
    if (extractedTargetIdx !== null && extractedTargetIdx === idx) {
      score += 80;
    }

    // Specific Differentiators
    // 10+2 / 12 (RRB NTPC 10+2 Exam / RRB-12)
    if (titleLower.includes('10+2') || codeLower.includes('12')) {
      if (combined.includes('10+2') || combined.includes('12') || combined.includes('barahvi') || combined.includes('barvi')) {
        score += 60;
      }
    }

    // Science / Sprint / General Awareness (Railway RRB NTPC General Awareness & Science Sprint)
    if (titleLower.includes('science') || titleLower.includes('sprint') || titleLower.includes('awareness')) {
      if (combined.includes('science') || combined.includes('sprint') || combined.includes('awareness') || combined.includes('general')) {
        score += 60;
      }
    }

    // UPSC CSAT
    if (titleLower.includes('csat') || codeLower.includes('csat')) {
      if (
        combined.includes('csat') ||
        combined.includes('upsc') ||
        combined.includes('civil') ||
        combined.includes('ias') ||
        combined.includes('paper 2') ||
        combined.includes('paper-2') ||
        combined.includes('paper ii')
      ) {
        score += 50;
      }
    }

    // IBPS PO
    if (titleLower.includes('ibps') || codeLower.includes('ibps')) {
      if (combined.includes('ibps') || combined.includes('po') || combined.includes('bank') || combined.includes('banking')) {
        score += 50;
      }
    }

    // SSC CGL
    if (titleLower.includes('ssc') || codeLower.includes('ssc')) {
      if (combined.includes('ssc') || combined.includes('cgl') || combined.includes('staff selection') || combined.includes('tier 1') || combined.includes('tier-1')) {
        score += 50;
      }
    }

    // Data Interpretation
    if (titleLower.includes('data interpretation') || codeLower.includes('di-data')) {
      if (combined.includes('data interpretation') || combined.includes('chart') || combined.includes('sonification') || combined.includes('graph')) {
        score += 50;
      }
    }

    // Code tokens match (e.g. RRB, NTPC, 04, 12, CGL, CSAT)
    const codeTokens = codeLower
      .split(/[-_\s]+/)
      .filter((t) => t.length >= 2 && !['test', 'mock', 'exam', 'set'].includes(t));

    for (const token of codeTokens) {
      if (new RegExp(`\\b${token}\\b`, 'i').test(combined)) {
        score += token.length <= 3 ? 15 : 10;
      }
    }

    // Distinctive words in title
    const words = titleLower
      .replace(/\b10\s*[\+\-]\s*2\b/g, '10+2')
      .split(/[\s\-:,/]+/)
      .map((w) => w.replace(/[^a-z0-9+]/gi, ''))
      .filter((w) => w.length >= 3 && !['test', 'mock', 'exam', 'paper', 'series', 'drill', 'open', 'start'].includes(w));

    for (const w of words) {
      if (new RegExp(`\\b${w.replace('+', '\\+')}\\b`, 'i').test(combined) || combined.includes(w)) {
        score += w.length <= 4 ? 12 : 8;
      }
    }

    // Railway category boost
    if (
      (combined.includes('rrb') || combined.includes('ntpc') || combined.includes('railway') || combined.includes('railways') || combined.includes('रेलवे') || combined.includes('आरआरबी')) &&
      (titleLower.includes('rrb') || codeLower.includes('rrb') || titleLower.includes('railway'))
    ) {
      score += 10;
    }

    if (score > highestScore) {
      highestScore = score;
      bestExam = exam;
    }
  }

  // If we found a clear scored winner (minimum threshold 10), return it!
  if (bestExam && highestScore >= 10) {
    return bestExam;
  }

  // If explicit index was requested and is valid, return that index directly
  if (extractedTargetIdx !== null && extractedTargetIdx >= 0 && extractedTargetIdx < allExams.length) {
    return allExams[extractedTargetIdx];
  }

  // Fallback to first practice exam ONLY if query is an explicit request to start/open a drill,
  // and NOT a listing/reading/inquiry query (e.g. "read all available practice drills")
  const isListingOrReadingQuery = /\b(?:read|list|show|available|all|explain|what|which|batao|dikhao|sunao|padho|uplabdh|tab|page|arena|catalog|overview)\b/i.test(combined);
  const isExplicitStartDrill =
    /\b(?:start|launch|open|begin|take|chalu|shuru|kholo|lagao)\b/i.test(combined) && !isListingOrReadingQuery;

  if (isExplicitStartDrill && (combined.includes('practice') || combined.includes('drill') || combined.includes('अभ्यास'))) {
    const practice = allExams.find((e) => e.id.includes('practice') || e.id.includes('drill'));
    if (practice) return practice;
  }

  return null;
}
