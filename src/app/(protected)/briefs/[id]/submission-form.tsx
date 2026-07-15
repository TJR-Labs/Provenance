"use client";

import { useActionState } from "react";

export type SubmissionFormValues = {
  repoUrl: string;
  demoUrl: string;
  writeup: string;
};

export type SubmissionFormState = {
  values: SubmissionFormValues;
  fieldErrors?: Partial<Record<keyof SubmissionFormValues, string[]>>;
  formError?: string;
  success?: boolean;
};

type SubmissionFormProps = {
  action: (
    state: SubmissionFormState,
    formData: FormData,
  ) => Promise<SubmissionFormState>;
  initialState: SubmissionFormState;
  isEditing: boolean;
};

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;

  return (
    <div className="mt-2 space-y-1" role="alert">
      {errors.map((error) => (
        <p key={error} className="text-sm text-red-300">
          {error}
        </p>
      ))}
    </div>
  );
}

export function SubmissionForm({
  action,
  initialState,
  isEditing,
}: SubmissionFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const inputClassName =
    "mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400";

  return (
    <form action={formAction} className="mt-6 space-y-6">
      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {state.formError}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          Submission saved.
        </p>
      ) : null}

      <label className="block text-sm font-medium text-slate-200">
        Repository URL
        <input
          name="repoUrl"
          type="url"
          required
          placeholder="https://github.com/you/project"
          defaultValue={state.values.repoUrl}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.repoUrl} />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Demo URL <span className="font-normal text-slate-400">(optional)</span>
        <span className="mt-1 block text-xs font-normal text-slate-400">
          Link to a live demo or video.
        </span>
        <input
          name="demoUrl"
          type="url"
          placeholder="https://example.com/demo"
          defaultValue={state.values.demoUrl}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.demoUrl} />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Writeup
        <span className="mt-1 block text-xs font-normal text-slate-400">
          Explain what you built, how to run it, and the key decisions you made.
        </span>
        <textarea
          name="writeup"
          required
          rows={10}
          defaultValue={state.values.writeup}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.writeup} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : isEditing ? "Update submission" : "Submit work"}
      </button>
    </form>
  );
}
