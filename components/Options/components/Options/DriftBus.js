'use client';

// Tiny event bus so StatsRail (or others) can publish the currently selected drift mode.
// Consumers listen to 'pricing:drift' on window and receive detail.mode.

const EVENT = 'pricing:drift';

export const DriftBus = {
  emit: function (mode) {
    try {
      if (typeof window !== 'undefined') {
        const evt = new CustomEvent(EVENT, { detail: { mode } });
        window.dispatchEvent(evt);
      }
    } catch (e) { /* noop */ }
  },

  on: function (cb) {
    try {
      if (typeof window === 'undefined' || typeof cb !== 'function') {
        return () => {};
      }
      const handler = (e) => {
        try {
          const mode = e && e.detail ? e.detail.mode : undefined;
          cb(mode);
        } catch (err) { /* noop */ }
      };
      window.addEventListener(EVENT, handler);
      return () => {
        try { window.removeEventListener(EVENT, handler); } catch (e) { /* noop */ }
      };
    } catch (e) {
      return () => {};
    }
  }
};

export default DriftBus;
