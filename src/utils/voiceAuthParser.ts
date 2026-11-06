/**
 * Parser and normalizer for voice-driven student authentication in DristiX.
 * Converts spoken Hindi, English, and Hinglish transcripts into clean roll numbers, emails,
 * passwords/PINs, and authentication intents.
 *
 * Supports single-step as well as one-shot combined commands like:
 * - "my roll no is 123 and my passwoard is 12345678"
 * - "मेरा रोल नंबर 123 और पासवर्ड 12345678 है"
 * - "mera roll no 101 aur password student123 login karo"
 */

// Hindi single and double digits mapping (0 to 30)
const HINDI_DIGITS: Record<string, string> = {
  'शून्य': '0',
  'जीरो': '0',
  'ज़ीरो': '0',
  'एक': '1',
  'दो': '2',
  'तीन': '3',
  'चार': '4',
  'पांच': '5',
  'पाँच': '5',
  'छह': '6',
  'छः': '6',
  'छे': '6',
  'सात': '7',
  'आठ': '8',
  'नौ': '9',
  'नो': '9',
  'दस': '10',
  'ग्यारह': '11',
  'बारह': '12',
  'तेरह': '13',
  'चौदह': '14',
  'पंद्रह': '15',
  'सोलह': '16',
  'सत्रह': '17',
  'अठारह': '18',
  'उन्नीस': '19',
  'बीस': '20',
  'इक्कीस': '21',
  'बाईस': '22',
  'तेईस': '23',
  'चौबीस': '24',
  'पच्चीस': '25',
  'छब्बीस': '26',
  'सत्ताईस': '27',
  'अट्ठाईस': '28',
  'उनतीस': '29',
  'तीस': '30',
  'इकतीस': '31',
  'बत्तीस': '32',
  'तैंतीस': '33',
  'चौंतीस': '34',
  'पैंतीस': '35',
  'छत्तीस': '36',
  'सैंतीस': '37',
  'अड़तीस': '38',
  'उनतालीस': '39',
  'चालीस': '40',
  'इकतालीस': '41',
  'बयालीस': '42',
  'तैंतालीस': '43',
  'चवालीस': '44',
  'पैंतालीस': '45',
  'छियालीस': '46',
  'सैंतालीस': '47',
  'अड़तालीस': '48',
  'उनचास': '49',
  'पचास': '50',
};

// Hindi 100-series phrases commonly spoken in exam halls (101 to 120)
const HINDI_HUNDREDS: Record<string, string> = {
  'एक सौ एक': '101',
  'एक सौ दो': '102',
  'एक सौ तीन': '103',
  'एक सौ चार': '104',
  'एक सौ पांच': '105',
  'एक सौ पाँच': '105',
  'एक सौ छह': '106',
  'एक सौ सात': '107',
  'एक सौ आठ': '108',
  'एक सौ नौ': '109',
  'एक सौ दस': '110',
  'सौ एक': '101',
  'सौ दो': '102',
  'सौ तीन': '103',
  'सौ चार': '104',
  'सौ पांच': '105',
  'सौ पाँच': '105',
};

// English digit words map (0 to 19, and tens)
const ENGLISH_NUMBERS: Record<string, string> = {
  'zero': '0',
  'one': '1',
  'two': '2',
  'three': '3',
  'four': '4',
  'five': '5',
  'six': '6',
  'seven': '7',
  'eight': '8',
  'nine': '9',
  'ten': '10',
  'eleven': '11',
  'twelve': '12',
  'thirteen': '13',
  'fourteen': '14',
  'fifteen': '15',
  'sixteen': '16',
  'seventeen': '17',
  'eighteen': '18',
  'nineteen': '19',
  'twenty': '20',
  'thirty': '30',
  'forty': '40',
  'fifty': '50',
  'sixty': '60',
  'seventy': '70',
  'eighty': '80',
  'ninety': '90',
};

// English 100-series phrases
const ENGLISH_HUNDREDS: Record<string, string> = {
  'one hundred and one': '101',
  'one hundred one': '101',
  'one oh one': '101',
  'one hundred and two': '102',
  'one hundred two': '102',
  'one oh two': '102',
  'one hundred and three': '103',
  'one hundred three': '103',
  'one oh three': '103',
  'one hundred and four': '104',
  'one hundred four': '104',
  'one oh four': '104',
  'one hundred and five': '105',
  'one hundred five': '105',
  'one oh five': '105',
};

// Digit word mapping for double/triple phrases
const DIGIT_WORD_TO_CHAR: Record<string, string> = {
  'zero': '0',
  'oh': '0',
  '0': '0',
  'one': '1',
  '1': '1',
  'two': '2',
  '2': '2',
  'three': '3',
  '3': '3',
  'four': '4',
  '4': '4',
  'five': '5',
  '5': '5',
  'six': '6',
  '6': '6',
  'seven': '7',
  '7': '7',
  'eight': '8',
  '8': '8',
  'nine': '9',
  '9': '9',
  'शून्य': '0',
  'जीरो': '0',
  'ज़ीरो': '0',
  'एक': '1',
  'दो': '2',
  'तीन': '3',
  'चार': '4',
  'पांच': '5',
  'पाँच': '5',
  'छह': '6',
  'सात': '7',
  'आठ': '8',
  'नौ': '9',
};

/**
 * Normalizes spoken number words (Hindi and English) into numeric digits.
 * Also standardizes common phonetic typos from speech engines like "passwoard" -> "password".
 * E.g.: "एक दो तीन चार" -> "1 2 3 4"
 * E.g.: "एक सौ दो" -> "102"
 * E.g.: "DX एक शून्य दो" -> "DX 1 0 2"
 * E.g.: "double five triple zero" -> "55 000"
 */
export function normalizeSpokenDigits(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Standardize common phonetic transcriptions from Web Speech engines
  cleaned = cleaned
    // User or speech recognition phonetic typos for password
    .replace(/\b(?:passwoard|passward|pass word|pass-word)\b/gi, 'password')
    .replace(/\b(?:passcode|pass code|pass-code)\b/gi, 'password')
    .replace(/\b(?:pin code|pin-code|pincode)\b/gi, 'pin')
    .replace(/(?:पास\s*कोड|पास-कोड|पास\s*वर्ड)/gi, 'पासवर्ड')
    .replace(/(?:पिन\s*कोड|पिन-कोड)/gi, 'पिन')
    // Roll number variations
    .replace(/\b(?:rollno|roll-no|rollnum|roll num|roll number|roll numbers)\b/gi, 'roll no')
    .replace(/(?:रोल\s*नंबर|रोल\s*नम्बर|रोल\s*नं|रोल\s*न)/gi, 'रोल नंबर');

  // 2. Replace "double <digit>" and "triple <digit>" phrases
  for (const [w, d] of Object.entries(DIGIT_WORD_TO_CHAR)) {
    const doubleRegex = new RegExp(`(?<=^|[\\s,.:;!?\\-])double\\s+${w}(?=[\\s,.:;!?\\-]|$)`, 'gi');
    cleaned = cleaned.replace(doubleRegex, `${d}${d}`);
    const tripleRegex = new RegExp(`(?<=^|[\\s,.:;!?\\-])triple\\s+${w}(?=[\\s,.:;!?\\-]|$)`, 'gi');
    cleaned = cleaned.replace(tripleRegex, `${d}${d}${d}`);
  }

  // 3. Replace multi-word hundred phrases first
  for (const [phrase, digits] of Object.entries(HINDI_HUNDREDS)) {
    const regex = new RegExp(`(?<=^|[\\s,.:;!?\\-])${phrase}(?=[\\s,.:;!?\\-]|$)`, 'gi');
    cleaned = cleaned.replace(regex, digits);
  }
  for (const [phrase, digits] of Object.entries(ENGLISH_HUNDREDS)) {
    const regex = new RegExp(`(?<=^|[\\s,.:;!?\\-])${phrase}(?=[\\s,.:;!?\\-]|$)`, 'gi');
    cleaned = cleaned.replace(regex, digits);
  }

  // 4. Replace Hindi spoken digits & numbers
  for (const [word, digit] of Object.entries(HINDI_DIGITS)) {
    const regex = new RegExp(`(?<=^|[\\s,.:;!?\\-])${word}(?=[\\s,.:;!?\\-]|$)`, 'gi');
    cleaned = cleaned.replace(regex, digit);
  }

  // 5. Replace English spoken numbers
  for (const [word, digit] of Object.entries(ENGLISH_NUMBERS)) {
    const regex = new RegExp(`(?<=^|[\\s,.:;!?\\-])${word}(?=[\\s,.:;!?\\-]|$)`, 'gi');
    cleaned = cleaned.replace(regex, digit);
  }

  // 6. Handle "oh" pronounced as '0' in digit sequences (e.g. "DX 1 oh 2" -> "DX 1 0 2")
  cleaned = cleaned.replace(/(?<=\b(?:DX|\d)\s+)oh(?=\s+\d|\b)/gi, '0');

  // 7. Replace common email phonetic phrases and prefixes
  cleaned = cleaned
    .replace(/(?<=^|[\s,.:;!?\-])(?:at\s*the\s*rate|एट\s*द\s*रेट|एट|at\s*rate)(?=[\\s,.:;!?\\-]|$)/gi, '@')
    .replace(/(?<=^|[\s,.:;!?\-])(?:dot|डॉट)(?=[\\s,.:;!?\\-]|$)/gi, '.')
    .replace(/(?<=^|[\s,.:;!?\-])(?:space|स्पेस)(?=[\\s,.:;!?\\-]|$)/gi, '')
    .replace(/(?:डी\s*एक्स|dx)/gi, 'DX')
    .replace(/(?:स्टूडेंट|स्टुडेंट)/gi, 'student');

  return cleaned;
}

/**
 * Normalizes a candidate identifier (Roll Number or Email) from spoken speech.
 * Handles variations like:
 * - "my roll no is 123" -> "123"
 * - "मेरा रोल नंबर 102 है" -> "102"
 * - "102" -> "102"
 * - "DX 102" -> "DX-102"
 * - "student@dristix.in" -> "student@dristix.in"
 */
export function extractSpokenGmail(transcript: string): string {
  if (!transcript || !transcript.trim()) return '';

  let text = normalizeSpokenDigits(transcript).trim();

  // Normalize phonetic terms commonly spoken for email addresses
  text = text
    .replace(/(?:\bat\s+the\s+rate\s+of\b|\bat\s+the\s+rate\b|\bat\s+rate\b|\bएट\s*द\s*रेट\b|\bएट\s*रेट\b)/gi, ' @ ')
    .replace(/(?:\bdot\b|\bडॉट\b|\bpoint\b|\bपॉइंट\b)/gi, ' . ')
    .replace(/(?:\bजीमेल\b|\bg\s*mail\b|\bgoogle\s*mail\b)/gi, ' gmail ')
    .replace(/(?:\bकॉम\b)/gi, ' com ')
    .replace(/\s+/g, ' ')
    .trim();

  // If "at gmail" was spoken without "the rate", convert "at gmail" -> "@ gmail"
  text = text.replace(/\bat\s+gmail\b/gi, '@ gmail');
  text = text.replace(/\bएट\s+gmail\b/gi, '@ gmail');

  // Pattern 1: Spoken sequence leading into @ gmail . com
  const gmailSpokenMatch = text.match(
    /(?:(?:my\s+)?(?:email|mail|ईमेल|gmail|id)\s+(?:is|hai|था|है|=|:)?\s*)?([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)*)\s*(?:@|\bat\b)?\s*gmail\s*(?:\.|\bdot\b|\s+)?\s*com\b/i
  );

  if (gmailSpokenMatch && gmailSpokenMatch[1]) {
    let usernamePart = gmailSpokenMatch[1].trim();

    // Strip leading conversational phrases
    usernamePart = usernamePart.replace(
      /^(?:(?:my|mera|meri|मेरा|मेरी|the|is|hai|है|था|=|:)\s*)+/i,
      ''
    );

    // In username, keep periods but compress spaces between characters
    // e.g. "sujal . sahu 196" -> "sujal.sahu196"
    usernamePart = usernamePart
      .replace(/\s*\.\s*/g, '.')
      .replace(/[\s\-_]+/g, '')
      .toLowerCase();

    if (usernamePart.length >= 2 && !/^(?:is|hai|my|the|a|an)$/i.test(usernamePart)) {
      return `${usernamePart}@gmail.com`;
    }
  }

  // Pattern 2: Standard formatted email in transcript
  const directEmail = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  if (directEmail) {
    const cleanEmail = directEmail[0].toLowerCase();
    if (cleanEmail.endsWith('@gmail.com') || cleanEmail.endsWith('@googlemail.com')) {
      return cleanEmail;
    }
  }

  // Pattern 3: Email with spaces around @ or . that standard regex missed
  const spacedEmail = text.match(/([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+)\s*\.\s*([a-zA-Z]{2,})/i);
  if (spacedEmail) {
    const combined = `${spacedEmail[1].replace(/\s+/g, '')}@${spacedEmail[2].replace(/\s+/g, '')}.${spacedEmail[3].replace(/\s+/g, '')}`.toLowerCase();
    return combined;
  }

  return '';
}

export function extractRollOrEmail(transcript: string): string {
  if (!transcript) return '';
  const gmail = extractSpokenGmail(transcript);
  if (gmail) return gmail;

  const text = normalizeSpokenDigits(transcript);

  // A. Check for valid email address
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  if (emailMatch) {
    return emailMatch[0].toLowerCase();
  }

  // B. Check for DX pattern like "DX 102", "DX-102", "dx102"
  const dxMatch = text.match(/(?:DX)\s*[-_ ]*\s*([0-9A-Z]+)/i);
  if (dxMatch && dxMatch[1]) {
    return `DX-${dxMatch[1].toUpperCase()}`;
  }

  // C. Check for any sequence of digits (e.g. "123", "1 2 3", "102")
  const digitSeqMatch = text.match(/\d[\d\s]*/);
  if (digitSeqMatch) {
    const cleanDigits = digitSeqMatch[0].replace(/\s+/g, '');
    const hasRollKeyword = /(?:roll\s*no|roll|candidate\s*id|student\s*id|रोल\s*नंबर|रोल)/i.test(text);
    if (hasRollKeyword && cleanDigits.length >= 3) {
      return cleanDigits;
    }
  }

  // D. Alphanumeric candidate ID fallback (e.g. "ADMIN-001", "CANDIDATE101")
  const alphaNumMatch = text.match(/[A-Z]+[-_][0-9]+/i);
  if (alphaNumMatch) {
    return alphaNumMatch[0].toUpperCase();
  }

  return '';
}

/**
 * Cleans and standardizes raw password candidate text (after a keyword or in standalone password speech).
 * Strips leading connector words ("is", "hai", "=", ":") and trailing submission commands.
 */
export function cleanPasswordValue(raw: string): string {
  if (!raw) return '';
  let cleaned = normalizeSpokenDigits(raw).trim();

  // Strip leading connector / filler words:
  // e.g.: "is 1234", "hai 1234", "to 1234", "= 1234", ": 1234", "tha 1234", "aur 1234"
  cleaned = cleaned.replace(/^(?:(?:is|hai|tha|thi|he|to|equals?|mera|meri|my|aur|and|=|:|-)\s*)+/i, '');

  // Strip trailing submission commands or filler words (English, Hinglish, and Hindi):
  // e.g.: "1234 login", "1234 login karo", "1234 submit", "1234 enter", "1234 hai", "1234 है"
  cleaned = cleaned.replace(/(?:\s+(?:login|log\s*in|karo|karein|kar\s*do|kar\s*dijiye|submit|enter|साइन\s*इन|लॉगिन|सबमिट|जमा\s*करो|लॉग\s*इन|hai|tha|thi|he|kardo|dijiye|है|था|थी|हूँ|हू|करो|करें|कर\s*दो|दर्ज\s*करो)\s*)*$/i, '');

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.,;!?]+$/, '').trim();

  // A. Check for "student" followed by numbers/alphanumerics (e.g. "student 123", "student123")
  const studentMatch = cleaned.match(/student\s*([0-9a-zA-Z\s]+)/i);
  if (studentMatch && studentMatch[1]) {
    const suffix = studentMatch[1].replace(/\s+/g, '');
    return `student${suffix}`;
  }

  // B. If it contains a sequence of digits (e.g. "12345678", "1 2 3 4 5 6 7 8", "12345678 है")
  const digitSeqMatch = cleaned.match(/\d[\d\s]*/);
  if (digitSeqMatch) {
    const cleanDigits = digitSeqMatch[0].replace(/\s+/g, '');
    if (cleanDigits.length >= 2) {
      // If the rest of the string is purely filler words (or empty), return cleanDigits
      const withoutDigits = cleaned.replace(digitSeqMatch[0], '').replace(/\s+/g, '');
      if (!withoutDigits || /^(?:hai|tha|thi|he|है|था|थी|हूँ|हू|login|karo|करो|करें)$/i.test(withoutDigits)) {
        return cleanDigits;
      }
    }
  }

  // C. If it has digits mixed with letters without sentence spaces (e.g. "pass 123" -> "pass123")
  if (/^[a-zA-Z0-9@_.-]+(?:\s+[a-zA-Z0-9@_.-]+)*$/.test(cleaned)) {
    const compressedDigits = cleaned.replace(/(\d)\s+(\d)/g, '$1$2').replace(/(\d)\s+(\d)/g, '$1$2');
    const noSpaces = compressedDigits.replace(/\s+/g, '');
    if (noSpaces.length >= 2 && !/^(?:my|is|hai|and|the|a|an|yes|no|है|था)$/i.test(noSpaces)) {
      return noSpaces;
    }
  }

  // Reject noise words
  if (/^(?:my|is|hai|the|a|an|yes|no|and|aur|है|था)$/i.test(cleaned) || cleaned.length < 2) {
    return '';
  }

  return cleaned;
}

/**
 * Normalizes password or PIN from spoken speech.
 * Handles standalone password utterances like:
 * - "my password is 12345678" -> "12345678"
 * - "12345678" -> "12345678"
 * - "student123" -> "student123"
 * - "student 123" -> "student123"
 * - "मेरा पासवर्ड student123 है" -> "student123"
 */
export function extractPassword(transcript: string): string {
  if (!transcript) return '';
  const norm = normalizeSpokenDigits(transcript);

  // If candidate is purely talking about roll number with NO password keyword, do not treat as password
  const hasPassWord = /(?:password|passwoard|passward|passcode|pass|pin|पिन|पासवर्ड|पासकोड)/i.test(norm);
  const hasRollWord = /(?:roll\s*no|roll|रोल\s*नंबर|रोल)/i.test(norm);
  const hasEmailWord = /(?:email|gmail|ईमेल|जीमेल|mail|googlemail)/i.test(norm);
  if ((hasRollWord || hasEmailWord) && !hasPassWord) {
    return '';
  }

  // Check if explicit password keyword exists
  const passMatch = norm.match(/(?:password|passwoard|passward|passcode|pass|pin|पिन|पासवर्ड|पासकोड)\s*[:=]?\s*(.+)/i);
  if (passMatch && passMatch[1]) {
    const cleaned = cleanPasswordValue(passMatch[1]);
    if (cleaned) return cleaned;
  }

  // Otherwise clean the whole transcript
  return cleanPasswordValue(norm);
}

/**
 * Checks if the utterance contains an explicit Login / Submit command.
 */
export function isLoginSubmitCommand(transcript: string): boolean {
  if (!transcript) return false;
  const lower = transcript.toLowerCase();
  return (
    lower.includes('लॉगिन करो') ||
    lower.includes('लॉग इन करो') ||
    lower.includes('लॉगिन') ||
    lower.includes('लॉग इन') ||
    lower.includes('सबमिट करो') ||
    lower.includes('सबमिट') ||
    lower.includes('साइन इन') ||
    lower.includes('जमा करो') ||
    lower.includes('login karo') ||
    lower.includes('login kardo') ||
    lower.includes('sign in') ||
    lower.includes('submit') ||
    lower.includes('enter') ||
    /\blogin\b/i.test(lower)
  );
}

export interface OneShotAuthResult {
  rollNumber?: string;
  password?: string;
  wantsSubmit: boolean;
}

/**
 * Robust parser that detects Roll Number / Email and Password spoken either together
 * in a single sentence or individually.
 *
 * Handles:
 * - "my roll no is 123 and my passwoard is 12345678"
 * - "मेरा रोल नंबर 123 और पासवर्ड 12345678 है"
 * - "mera roll no 123 aur password 12345678 login karo"
 * - "roll no 101 password student123"
 * - "email rohit@dristix.edu and password student123"
 * - "my password is 12345678 and roll no is 123" (password first)
 * - "123 and password 12345678" (direct roll without keyword)
 */
export function parseOneShotLogin(transcript: string): OneShotAuthResult | null {
  if (!transcript || !transcript.trim()) return null;

  const norm = normalizeSpokenDigits(transcript);
  const wantsSubmit = isLoginSubmitCommand(transcript);

  const PASS_REGEX = /(?:password|passwoard|passward|passcode|pass|pin|पिन|पासवर्ड|पासकोड)/i;
  const ROLL_REGEX = /(?:roll\s*no|roll|candidate\s*id|student\s*id|user\s*id|registration\s*no|reg\s*no|रोल\s*नंबर|रोल|कैंडिडेट\s*आईडी|ईमेल|ई-मेल|email|mail)/i;

  const passIndex = norm.search(PASS_REGEX);
  const rollIndex = norm.search(ROLL_REGEX);

  // Case 1: Both Roll/Email and Password keywords are present in the sentence
  if (passIndex !== -1 && rollIndex !== -1) {
    if (rollIndex < passIndex) {
      // Roll comes before Password:
      // "my roll no is 123 and my password is 12345678"
      const rollSegment = norm.substring(rollIndex, passIndex);
      const passMatch = norm.substring(passIndex).match(PASS_REGEX);
      const passKeywordLen = passMatch ? passMatch[0].length : 8;
      const passSegment = norm.substring(passIndex + passKeywordLen);

      const roll = extractRollOrEmail(rollSegment);
      const pass = cleanPasswordValue(passSegment);

      if (roll || pass) {
        return {
          rollNumber: roll || undefined,
          password: pass || undefined,
          wantsSubmit: wantsSubmit || (Boolean(roll) && Boolean(pass)),
        };
      }
    } else {
      // Password comes before Roll:
      // "my password is 12345678 and my roll no is 123"
      const passMatch = norm.substring(passIndex).match(PASS_REGEX);
      const passKeywordLen = passMatch ? passMatch[0].length : 8;
      const passSegment = norm.substring(passIndex + passKeywordLen, rollIndex);
      const rollSegment = norm.substring(rollIndex);

      const pass = cleanPasswordValue(passSegment);
      const roll = extractRollOrEmail(rollSegment);

      if (roll || pass) {
        return {
          rollNumber: roll || undefined,
          password: pass || undefined,
          wantsSubmit: wantsSubmit || (Boolean(roll) && Boolean(pass)),
        };
      }
    }
  }

  // Case 2: Password keyword is present, but NO explicit roll keyword
  // E.g. "123 and my password is 12345678" or "DX-102 password student123" or "rohit@dristix.edu password student123"
  if (passIndex !== -1) {
    const beforePass = norm.substring(0, passIndex).trim();
    const passMatch = norm.substring(passIndex).match(PASS_REGEX);
    const passKeywordLen = passMatch ? passMatch[0].length : 8;
    const afterPass = norm.substring(passIndex + passKeywordLen);

    const roll = extractRollOrEmail(beforePass);
    const pass = cleanPasswordValue(afterPass);

    if (roll && pass) {
      return {
        rollNumber: roll,
        password: pass,
        wantsSubmit: true,
      };
    } else if (pass) {
      return {
        rollNumber: roll || undefined,
        password: pass,
        wantsSubmit,
      };
    }
  }

  // Case 3: Roll keyword is present, but NO password keyword
  // E.g. "my roll no is 123" or "mera roll no 123 hai"
  if (rollIndex !== -1) {
    const roll = extractRollOrEmail(norm);
    if (roll) {
      return {
        rollNumber: roll,
        password: undefined,
        wantsSubmit,
      };
    }
  }

  // Case 4: Standalone direct roll/email or standalone password
  const directRoll = extractRollOrEmail(norm);
  if (directRoll) {
    return {
      rollNumber: directRoll,
      password: undefined,
      wantsSubmit,
    };
  }

  const directPass = extractPassword(norm);
  if (directPass) {
    return {
      rollNumber: undefined,
      password: directPass,
      wantsSubmit,
    };
  }

  return null;
}
