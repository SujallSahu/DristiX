import type { Exam, QuestionItem } from '../../shared/types';
import { OFFLINE_PRACTICE_DRILLS } from '../data/offlinePracticeDrills';

const DB_NAME = 'dristix_practice_offline_db';
const DB_VERSION = 2;
const STORE_DRILLS = 'practice_drills';
const STORE_QUESTIONS = 'drill_questions';
const STORE_SUBMISSIONS = 'offline_submissions';
const STORE_FEEDBACK = 'offline_feedback';

interface StoredQuestions {
  drillId: string;
  questions: QuestionItem[];
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DRILLS)) {
        db.createObjectStore(STORE_DRILLS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
        db.createObjectStore(STORE_QUESTIONS, { keyPath: 'drillId' });
      }
      if (!db.objectStoreNames.contains(STORE_SUBMISSIONS)) {
        db.createObjectStore(STORE_SUBMISSIONS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_FEEDBACK)) {
        db.createObjectStore(STORE_FEEDBACK, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const offlinePracticeStorage = {
  /**
   * Bundled offline practice drills ready out-of-the-box
   */
  bundledDrills: OFFLINE_PRACTICE_DRILLS,

  /**
   * Save practice drills catalog metadata into IndexedDB
   */
  async cachePracticeDrills(drills: Exam[]): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_DRILLS, 'readwrite');
      const store = tx.objectStore(STORE_DRILLS);
      drills.forEach((drill) => {
        store.put(drill);
      });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[OfflinePractice] Failed to cache drills:', err);
    }
  },

  /**
   * Retrieve all cached practice drills from IndexedDB, falling back to bundled drills
   */
  async getCachedPracticeDrills(): Promise<Exam[]> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_DRILLS, 'readonly');
      const store = tx.objectStore(STORE_DRILLS);
      const req = store.getAll();
      const stored = await new Promise<Exam[]>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      if (stored && stored.length > 0) {
        return stored;
      }
      return OFFLINE_PRACTICE_DRILLS;
    } catch {
      return OFFLINE_PRACTICE_DRILLS;
    }
  },

  /**
   * Cache full questions and answer key for a specific practice drill
   */
  async cacheDrillQuestions(drillId: string, questions: QuestionItem[]): Promise<void> {
    if (!drillId || !questions.length) return;
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_QUESTIONS, 'readwrite');
      const store = tx.objectStore(STORE_QUESTIONS);
      const record: StoredQuestions = {
        drillId,
        questions,
        cachedAt: Date.now(),
      };
      store.put(record);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[OfflinePractice] Failed to cache drill questions:', err);
    }
  },

  /**
   * Retrieve cached questions for an offline practice drill attempt.
   * Checks IndexedDB by drillId/code and seamlessly falls back to bundled questions.
   */
  async getCachedDrillQuestions(drillId: string, drillCode?: string): Promise<QuestionItem[] | null> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_QUESTIONS, 'readonly');
      const store = tx.objectStore(STORE_QUESTIONS);
      
      // Try by exact ID
      const req = store.get(drillId);
      const byId = await new Promise<StoredQuestions | undefined>((resolve) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });

      if (byId?.questions?.length) {
        return byId.questions;
      }

      // Try by drillCode if provided
      if (drillCode && drillCode !== drillId) {
        const reqCode = store.get(drillCode);
        const byCode = await new Promise<StoredQuestions | undefined>((resolve) => {
          reqCode.onsuccess = () => resolve(reqCode.result);
          reqCode.onerror = () => resolve(undefined);
        });
        if (byCode?.questions?.length) {
          return byCode.questions;
        }
      }
    } catch {
      // IndexedDB query failed or unavailable, proceed to bundled fallback
    }

    // Bundled fallback
    const bundled = OFFLINE_PRACTICE_DRILLS.find(
      (d) => d.id === drillId || d.code === drillId || (drillCode && d.code === drillCode)
    );
    if (bundled && bundled.questions && bundled.questions.length > 0) {
      return bundled.questions as QuestionItem[];
    }

    return null;
  },

  /**
   * Queue offline submission made during offline practice drill
   */
  async saveOfflineSubmission(submission: Record<string, unknown>): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      store.add({ ...submission, recordedAt: Date.now() });
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('[OfflinePractice] Could not record offline submission:', err);
    }
  },

  /**
   * Get all queued offline submissions waiting for internet sync
   */
  async getOfflineSubmissions(): Promise<any[]> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_SUBMISSIONS, 'readonly');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  /**
   * Clear synced submission from outbox
   */
  async clearOfflineSubmission(id: number | string): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      store.delete(id);
    } catch {}
  },

  /**
   * Clear all queued offline test submissions
   */
  async clearAllOfflineSubmissions(): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      store.clear();
    } catch {}
  },

  /**
   * Queue offline feedback submission
   */
  async saveOfflineFeedback(feedback: Record<string, unknown>): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_FEEDBACK, 'readwrite');
      const store = tx.objectStore(STORE_FEEDBACK);
      store.add({ ...feedback, recordedAt: Date.now() });
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('[OfflinePractice] Could not record offline feedback:', err);
    }
  },

  /**
   * Get all queued offline feedbacks waiting for internet sync
   */
  async getOfflineFeedbacks(): Promise<any[]> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_FEEDBACK, 'readonly');
      const store = tx.objectStore(STORE_FEEDBACK);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  /**
   * Clear synced feedback from outbox
   */
  async clearOfflineFeedback(id: number | string): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_FEEDBACK, 'readwrite');
      const store = tx.objectStore(STORE_FEEDBACK);
      store.delete(id);
    } catch {}
  },
};
