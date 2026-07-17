export const AUTOSAVE_INTERVAL_MS = 30_000;

export type AutosaveController = {
  /** Mark the draft dirty; the next tick will persist it. */
  notifyChange(): void;
  /** Save immediately if dirty, then clear the timer. */
  flush(): void;
  /** Clear the interval without saving. */
  stop(): void;
};

export function createAutosaveController(options: {
  intervalMs: number;
  save: () => void | Promise<void>;
}): AutosaveController {
  let dirty = false;

  const timer = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    void options.save();
  }, options.intervalMs);

  return {
    notifyChange() {
      dirty = true;
    },
    flush() {
      clearInterval(timer);
      if (dirty) {
        dirty = false;
        void options.save();
      }
    },
    stop() {
      clearInterval(timer);
    },
  };
}
