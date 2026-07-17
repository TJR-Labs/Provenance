import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAutosaveController } from "./autosave";

const INTERVAL = 30_000;

describe("createAutosaveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves on the next tick after a change", () => {
    const save = vi.fn();
    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save,
    });

    controller.notifyChange();
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVAL);
    expect(save).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it("does not save again when nothing changed since the last save", () => {
    const save = vi.fn();
    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save,
    });

    controller.notifyChange();
    vi.advanceTimersByTime(INTERVAL);
    expect(save).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL * 3);
    expect(save).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it("flush saves immediately when dirty, without waiting for the timer", () => {
    const save = vi.fn();
    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save,
    });

    controller.notifyChange();
    controller.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush clears the timer so no further ticks fire", () => {
    const save = vi.fn();
    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save,
    });

    controller.flush();
    expect(save).not.toHaveBeenCalled();

    controller.notifyChange();
    vi.advanceTimersByTime(INTERVAL * 2);
    expect(save).not.toHaveBeenCalled();
  });

  it("flush does nothing when not dirty", () => {
    const save = vi.fn();
    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save,
    });

    controller.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("stop clears the interval without saving", () => {
    const save = vi.fn();
    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save,
    });

    controller.notifyChange();
    controller.stop();
    vi.advanceTimersByTime(INTERVAL * 2);
    expect(save).not.toHaveBeenCalled();
  });

  it("persists the draft state ~30s after an elapsed-time change, matching a saveDraft-style call", () => {
    // Stand-in for the server draft store `canvas.saveDraft` writes to
    // (src/server/canvas.ts's `saveCanvasDraft`) — proves the controller's
    // elapsed-time tick is what actually lands a change, not just that a
    // callback fires.
    const store: { persistedDraft: { elements: string[]; savedAt: number } | null } =
      { persistedDraft: null };
    let inEditorElements: string[] = [];

    const controller = createAutosaveController({
      intervalMs: INTERVAL,
      save: () => {
        store.persistedDraft = {
          elements: [...inEditorElements],
          savedAt: Date.now(),
        };
      },
    });

    // User places an element; nothing is persisted yet.
    inEditorElements = ["about"];
    controller.notifyChange();
    expect(store.persistedDraft).toBeNull();

    // ~30s of elapsed editing time passes with no further changes.
    vi.advanceTimersByTime(INTERVAL);
    expect(store.persistedDraft?.elements).toEqual(["about"]);
    expect(typeof store.persistedDraft?.savedAt).toBe("number");

    // A later change is only reflected in the persisted draft on the next tick.
    inEditorElements = ["about", "links"];
    controller.notifyChange();
    vi.advanceTimersByTime(INTERVAL);
    expect(store.persistedDraft?.elements).toEqual(["about", "links"]);
    expect(typeof store.persistedDraft?.savedAt).toBe("number");

    controller.stop();
  });
});
