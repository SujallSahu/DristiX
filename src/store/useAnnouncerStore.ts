import { create } from 'zustand';
import { speechEngine } from '../utils/speechEngine';

export type AnnouncementPriority = 'polite' | 'assertive';

interface AnnouncerState {
  politeMessage: string;
  assertiveMessage: string;
  history: Array<{ message: string; timestamp: number; priority: AnnouncementPriority }>;
  announce: (message: string, priority?: AnnouncementPriority, speakTTS?: boolean, interrupt?: boolean) => void;
  clear: () => void;
  stopSpeech: () => void;
}

export const useAnnouncerStore = create<AnnouncerState>((set) => ({
  politeMessage: '',
  assertiveMessage: '',
  history: [],

  announce: (message: string, priority: AnnouncementPriority = 'polite', speakTTS: boolean = true, interrupt: boolean = true) => {
    if (!message) return;

    // Small delay toggle to ensure assistive tech detects text change even if string is repeated
    if (priority === 'assertive') {
      set({ assertiveMessage: '' });
      setTimeout(() => {
        set((state) => ({
          assertiveMessage: message,
          history: [{ message, timestamp: Date.now(), priority }, ...state.history.slice(0, 19)],
        }));
      }, 50);
    } else {
      set({ politeMessage: '' });
      setTimeout(() => {
        set((state) => ({
          politeMessage: message,
          history: [{ message, timestamp: Date.now(), priority }, ...state.history.slice(0, 19)],
        }));
      }, 50);
    }

    // TTS vocalization: ALWAYS interrupt previous queued speech unless specifically told not to
    if (speakTTS && speechEngine.enabled) {
      speechEngine.speak(message, interrupt);
    }
  },

  clear: () => set({ politeMessage: '', assertiveMessage: '' }),

  stopSpeech: () => {
    set({ politeMessage: '', assertiveMessage: '' });
    speechEngine.stop();
  },
}));
