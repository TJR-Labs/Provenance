"use client";

import { useEffect, useRef, useState } from "react";

const MIN_LENGTH = 8;

// Client island for the signup password input: a live indicator that the
// 8-character minimum is met, updating as the user types. The input stays
// uncontrolled so the server action receives it normally and browser autofill
// is never clobbered by React state; the indicator tracks the field via a
// mount-time read plus native input/change listeners. The `defaultValue` prop
// exists so tests (and any future pre-fill) can simulate an autofilled value.
export function PasswordField({ defaultValue = "" }: { defaultValue?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const sync = () => setValue(input.value);
    // Reflect a value the browser pre-filled/autofilled before this ran, so
    // the indicator is correct on load and not only after a keystroke.
    sync();
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    return () => {
      input.removeEventListener("input", sync);
      input.removeEventListener("change", sync);
    };
  }, []);

  const met = value.length >= MIN_LENGTH;

  return (
    <label className="text-ink block text-sm font-medium">
      Password
      <input
        ref={ref}
        name="password"
        type="password"
        required
        minLength={MIN_LENGTH}
        defaultValue={defaultValue}
        autoComplete="new-password"
        aria-describedby="password-hint"
        className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
      />
      <span
        id="password-hint"
        aria-live="polite"
        className={`mt-2 block text-xs font-normal ${
          met ? "text-success" : "text-muted"
        }`}
      >
        {met ? "✓ " : ""}
        {MIN_LENGTH} characters minimum
      </span>
    </label>
  );
}
