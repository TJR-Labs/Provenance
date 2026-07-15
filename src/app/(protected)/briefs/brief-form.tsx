"use client";

import { useActionState } from "react";

export type BriefFormValues = {
  title: string;
  summary: string;
  description: string;
  domain: string;
  deliverables: string;
};

export type BriefFormState = {
  values: BriefFormValues;
  fieldErrors?: Partial<Record<keyof BriefFormValues, string[]>>;
  formError?: string;
};

type BriefFormProps = {
  action: (
    state: BriefFormState,
    formData: FormData,
  ) => Promise<BriefFormState>;
  initialState: BriefFormState;
  submitLabel: string;
};

const domains = [
  ["SOFTWARE", "Software"],
  ["ML_AI", "ML / AI"],
  ["HARDWARE_ROBOTICS", "Hardware / robotics"],
] as const;

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

export function BriefForm({
  action,
  initialState,
  submitLabel,
}: BriefFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const inputClassName =
    "mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400";

  return (
    <form
      action={formAction}
      className="mt-8 space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8"
    >
      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {state.formError}
        </p>
      ) : null}

      <label className="block text-sm font-medium text-slate-200">
        Title
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={state.values.title}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.title} />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Summary
        <span className="mt-1 block text-xs font-normal text-slate-400">
          A one-line overview, up to 200 characters.
        </span>
        <input
          name="summary"
          required
          maxLength={200}
          defaultValue={state.values.summary}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.summary} />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Domain
        <select
          name="domain"
          required
          defaultValue={state.values.domain}
          className={inputClassName}
        >
          <option value="" disabled>
            Choose a domain
          </option>
          {domains.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <FieldErrors errors={state.fieldErrors?.domain} />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Description
        <textarea
          name="description"
          required
          rows={10}
          defaultValue={state.values.description}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.description} />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Deliverables
        <span className="mt-1 block text-xs font-normal text-slate-400">
          Describe everything a submission must include.
        </span>
        <textarea
          name="deliverables"
          required
          rows={6}
          defaultValue={state.values.deliverables}
          className={inputClassName}
        />
        <FieldErrors errors={state.fieldErrors?.deliverables} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
