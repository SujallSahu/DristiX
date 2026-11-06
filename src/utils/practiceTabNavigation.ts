/**
 * Detects utterances that only mean "switch to the Practice tab" — they do NOT
 * mean "start this practice drill now".
 *
 * Why this helper has to exist: `matchExamFromQuery()` (examMatcher rule 9)
 * treats the bare word "practice" as an alias for a Practice Drill, so the
 * sentence "go on the practice tab" resolves to the first drill in the catalog
 * and the assistant launches it as a live test. Navigation phrasing must be
 * recognised *before* any exam is matched from the query.
 *
 * Deliberately conservative: a bare "practice" with no page/tab cue (e.g.
 * "start practice drill") is still treated as a request to start a drill.
 * Works for English, Hinglish and Devanagari transcripts.
 */
export function isPracticeTabNavigation(rawQuery: string): boolean {
  const q = (rawQuery || '').toLowerCase().trim();
  if (!q) return false;

  // Never match if starting an actual test by title or explicit "start"
  if (/(?:start|shuru|launch|take)\s+(?:drill|test|practice|exam)?/i.test(q)) {
    return false;
  }

  const mentionsPractice =
    q.includes('practice') ||
    q.includes('practic') ||
    q.includes('pratic') ||
    q.includes('drill') ||
    q.includes('प्रैक') ||
    q.includes('अभ्यास') ||
    q.includes('ड्रिल');

  if (!mentionsPractice) return false;

  // Explicit tab/page/navigation cues
  return (
    q.includes('tab') ||
    q.includes('page') ||
    q.includes('arena') ||
    q.includes('dashboard') ||
    q.includes('screen') ||
    q.includes('section') ||
    q.includes('switch') ||
    q.includes('open') ||
    q.includes('show') ||
    q.includes('go to') ||
    q.includes('view') ||
    q.includes('टैब') ||
    q.includes('पेज') ||
    q.includes('अरीना') ||
    q.includes('डैशबोर्ड') ||
    q.includes('खोलो') ||
    q.includes('दिखाओ') ||
    q.includes('जाओ') ||
    /^(?:practice|practice arena|drills|practice drills|अभ्यास)$/i.test(q)
  );
}