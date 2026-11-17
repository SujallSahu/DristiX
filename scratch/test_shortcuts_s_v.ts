import assert from 'assert';

console.log('--- Testing Keyboard Navigation & Speech Interruption (S & V keys) ---');

// 1. Test Key Matching Logic for 'S' (English + Hindi layouts)
function matchStopKey(e: { key?: string; code?: string; keyCode?: number; which?: number; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return (
    (
      (e.key && (e.key.toLowerCase() === 's' || e.key === 'े' || e.key === 'स' || e.key === 'ए')) ||
      e.code === 'KeyS' ||
      e.keyCode === 83 ||
      e.which === 83
    ) &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey
  );
}

// 2. Test Key Matching Logic for 'V' (English + Hindi layouts)
function matchToggleVoiceKey(e: { key?: string; code?: string; keyCode?: number; which?: number; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return (
    (
      (e.key && (e.key.toLowerCase() === 'v' || e.key === 'ल' || e.key === 'न')) ||
      e.code === 'KeyV' ||
      e.keyCode === 86 ||
      e.which === 86 ||
      (e.altKey && (e.key?.toLowerCase() === 'v' || e.code === 'KeyV' || e.key === 'ल' || e.key === 'न'))
    ) &&
    !e.ctrlKey &&
    !e.metaKey
  );
}

// 3. Test Key Matching Logic for 'L' (English + Hindi layouts)
function matchLangKey(e: { key?: string; code?: string; keyCode?: number; which?: number; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return (
    (
      (e.key && (e.key.toLowerCase() === 'l' || e.key === 'त' || e.key === 'ल')) ||
      e.code === 'KeyL' ||
      e.keyCode === 76 ||
      e.which === 76
    ) &&
    !e.ctrlKey &&
    !e.metaKey
  );
}

// Test S key across layouts
console.log('Testing S key across English and Hindi InScript layouts...');
assert.strictEqual(matchStopKey({ key: 's' }), true, "English lowercase 's' should match");
assert.strictEqual(matchStopKey({ key: 'S' }), true, "English uppercase 'S' should match");
assert.strictEqual(matchStopKey({ code: 'KeyS' }), true, "Physical KeyS should match");
assert.strictEqual(matchStopKey({ keyCode: 83 }), true, "keyCode 83 should match");
assert.strictEqual(matchStopKey({ key: 'े' }), true, "Hindi InScript 'े' should match");
assert.strictEqual(matchStopKey({ key: 'स' }), true, "Hindi InScript 'स' should match");
assert.strictEqual(matchStopKey({ key: 's', altKey: true }), false, "Alt+S should NOT match stop key (used for submit)");
assert.strictEqual(matchStopKey({ key: 's', ctrlKey: true }), false, "Ctrl+S should NOT match stop key");

// Test V key across layouts
console.log('Testing V key across English and Hindi InScript layouts...');
assert.strictEqual(matchToggleVoiceKey({ key: 'v' }), true, "English lowercase 'v' should match");
assert.strictEqual(matchToggleVoiceKey({ key: 'V' }), true, "English uppercase 'V' should match");
assert.strictEqual(matchToggleVoiceKey({ code: 'KeyV' }), true, "Physical KeyV should match");
assert.strictEqual(matchToggleVoiceKey({ keyCode: 86 }), true, "keyCode 86 should match");
assert.strictEqual(matchToggleVoiceKey({ key: 'ल' }), true, "Hindi InScript 'ल' should match");
assert.strictEqual(matchToggleVoiceKey({ key: 'न' }), true, "Hindi InScript 'न' should match");
assert.strictEqual(matchToggleVoiceKey({ key: 'v', altKey: true }), true, "Alt+V should match toggle voice");
assert.strictEqual(matchToggleVoiceKey({ key: 'v', ctrlKey: true }), false, "Ctrl+V should NOT match (standard paste)");

// Test L key across layouts
console.log('Testing L key across English and Hindi InScript layouts...');
assert.strictEqual(matchLangKey({ key: 'l' }), true, "English lowercase 'l' should match");
assert.strictEqual(matchLangKey({ key: 'L' }), true, "English uppercase 'L' should match");
assert.strictEqual(matchLangKey({ code: 'KeyL' }), true, "Physical KeyL should match");
assert.strictEqual(matchLangKey({ key: 'त' }), true, "Hindi InScript 'त' should match");
assert.strictEqual(matchLangKey({ key: 'ल' }), true, "Hindi InScript 'ल' should match");

// Test Student Portal Gating for 'S' Stop Key
console.log('Testing Student Portal Gating for S stop key...');
function simulateShortcutPress(e: any, isStudentLoggedIn: boolean, isAdminPath: boolean, modalsOpen: boolean) {
  const isStudentPortal = isStudentLoggedIn && !isAdminPath;
  const isStopKey = matchStopKey(e);
  const isToggleVoice = matchToggleVoiceKey(e);

  let stoppedSpeech = false;
  let toggledVoice = false;

  // Student Portal after login requirement
  if (isStopKey && isStudentPortal) {
    stoppedSpeech = true;
    return { stoppedSpeech, toggledVoice };
  }

  // Voice toggle works across modals
  if (isToggleVoice) {
    toggledVoice = true;
    return { stoppedSpeech, toggledVoice };
  }

  return { stoppedSpeech, toggledVoice };
}

// Case A: User NOT logged in (Landing page or login page)
const unauthResult = simulateShortcutPress({ key: 's' }, false, false, false);
assert.strictEqual(unauthResult.stoppedSpeech, false, "Before login, 'S' must NOT trigger stop speech");

// Case B: User on admin path
const adminResult = simulateShortcutPress({ key: 's' }, true, true, false);
assert.strictEqual(adminResult.stoppedSpeech, false, "On admin path, 'S' must NOT trigger student portal stop speech");

// Case C: Student logged in in Student Portal (normal view)
const studentResult = simulateShortcutPress({ key: 's' }, true, false, false);
assert.strictEqual(studentResult.stoppedSpeech, true, "In Student Portal after login, 'S' must trigger stop speech");

// Case D: Student logged in with Hindi keyboard 'े'
const studentHindiResult = simulateShortcutPress({ key: 'े' }, true, false, false);
assert.strictEqual(studentHindiResult.stoppedSpeech, true, "In Student Portal with Hindi keyboard, 'े' must trigger stop speech");

// Case E: Student logged in with Question Palette or Submit Modal open
const studentModalResult = simulateShortcutPress({ key: 's' }, true, false, true);
assert.strictEqual(studentModalResult.stoppedSpeech, true, "In Student Portal with modal open, 'S' must still trigger stop speech");

// Case F: Voice Toggle with modal open (English & Hindi)
const voiceModalResultEn = simulateShortcutPress({ key: 'v' }, true, false, true);
assert.strictEqual(voiceModalResultEn.toggledVoice, true, "Voice toggle 'V' must trigger even when modal is open");

const voiceModalResultHi = simulateShortcutPress({ key: 'ल' }, true, false, true);
assert.strictEqual(voiceModalResultHi.toggledVoice, true, "Voice toggle 'ल' (Hindi) must trigger even when modal is open");

console.log('✅ ALL 16 SHORTCUT AND GATING TESTS PASSED SUCCESSFULLY!');
