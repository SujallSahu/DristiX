import { soundEffects } from './soundEffects';
import { useAnnouncerStore } from '../store/useAnnouncerStore';

export type ScrollDirection = 'up' | 'down' | 'top' | 'bottom';

/**
 * Universal Smooth Scrolling Helper for DristiX AI Voice Assistant.
 * Supports scrolling the viewport or any actively open modal dialog.
 */
export function performScroll(direction: ScrollDirection, isHindi: boolean = false): {
  success: boolean;
  reply: string;
} {
  if (typeof window === 'undefined') {
    return { success: false, reply: '' };
  }

  // Find if an active scrollable modal or drawer is currently open
  const activeModal = document.querySelector(
    '[role="dialog"][aria-modal="true"], .fixed.inset-0.overflow-y-auto, [role="region"][aria-label*="modal" i]'
  ) as HTMLElement | null;

  const targetContainer =
    activeModal && activeModal.scrollHeight > activeModal.clientHeight
      ? activeModal
      : null;

  const scrollDistance = Math.round(window.innerHeight * 0.65) || 450;

  switch (direction) {
    case 'top': {
      if (targetContainer) {
        targetContainer.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      soundEffects.playSelect();
      const reply = isHindi
        ? 'पेज के सबसे ऊपर स्क्रॉल कर दिया गया है।'
        : 'Scrolled to the top of the page.';
      useAnnouncerStore.getState().announce(reply, 'polite', true);
      return { success: true, reply };
    }
    case 'bottom': {
      if (targetContainer) {
        targetContainer.scrollTo({ top: targetContainer.scrollHeight, behavior: 'smooth' });
      } else {
        const maxScroll = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        );
        window.scrollTo({ top: maxScroll, behavior: 'smooth' });
      }
      soundEffects.playSelect();
      const reply = isHindi
        ? 'पेज के सबसे नीचे स्क्रॉल कर दिया गया है।'
        : 'Scrolled to the bottom of the page.';
      useAnnouncerStore.getState().announce(reply, 'polite', true);
      return { success: true, reply };
    }
    case 'up': {
      if (targetContainer) {
        targetContainer.scrollBy({ top: -scrollDistance, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: -scrollDistance, behavior: 'smooth' });
      }
      soundEffects.playSelect();
      const reply = isHindi
        ? 'पेज ऊपर स्क्रॉल कर दिया गया है।'
        : 'Scrolled up.';
      useAnnouncerStore.getState().announce(reply, 'polite', true);
      return { success: true, reply };
    }
    case 'down': {
      if (targetContainer) {
        targetContainer.scrollBy({ top: scrollDistance, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: scrollDistance, behavior: 'smooth' });
      }
      soundEffects.playSelect();
      const reply = isHindi
        ? 'पेज नीचे स्क्रॉल कर दिया गया है।'
        : 'Scrolled down.';
      useAnnouncerStore.getState().announce(reply, 'polite', true);
      return { success: true, reply };
    }
  }
}
