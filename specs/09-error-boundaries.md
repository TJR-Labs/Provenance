# Error Boundaries — Spec

## Objective
There is currently no `error.tsx` or `global-error.tsx` anywhere under
`src/app`. An unhandled exception in any Server or Client Component currently
falls through to Next.js's default error handling, which in production shows
a bare, unbranded failure with no path back into the app and no server-side
trace of what happened. This spec adds proper error boundaries. Success: an
unexpected crash anywhere in the app shows a branded, safe error page with a
way to recover, and gets logged server-side.

## Requirements
Must-have:
1. `src/app/error.tsx` (Client Component, `"use client"`): catches errors
   thrown while rendering any route segment under the root layout. Uses the
   shared nav/footer layout. Shows a generic message ("Something went wrong.")
   and a "Try again" button wired to the `reset()` callback Next.js passes in.
   No error message, stack trace, or `error.digest` shown to the user.
2. `src/app/global-error.tsx`: catches errors thrown by the root layout itself
   (the one case `error.tsx` can't catch). Per Next.js requirements, this
   component renders its own `<html>` and `<body>` — keep it minimal (it can't
   safely assume the shared layout still works) but on-brand (Provenance name,
   generic message, a plain `<a href="/">` link home since router state may be
   broken).
3. Both boundaries call `console.error` with the caught error (including
   `error.digest` when present) so the failure shows up in server logs even
   though the user only sees a generic message.

## Constraints
- Client Components only where Next.js requires it (`error.tsx` and
  `global-error.tsx` must be client components per the framework).
- No new dependency — plain React/Next.js error boundary conventions.
- Must not swallow or interfere with the existing `not-found.tsx` /
  `forbidden.tsx` flows, which are intentional redirects, not crashes.

## Edge Cases
- Error thrown deep in a page under `(protected)/` → nearest `error.tsx`
  catches it; nav/footer still render since the boundary is below root layout.
- Error thrown in `RootLayout` itself → `global-error.tsx` catches it; app
  still shows *something* usable (name + home link) rather than a blank page.
- User clicks "Try again" after a transient failure → `reset()` re-renders the
  segment; if the underlying cause is fixed (or was transient), the page
  recovers without a full navigation.
- Intentional `notFound()` / `forbidden()` calls continue to render their
  existing dedicated pages, not the new error boundary.

## Definition of Done
- [ ] `npm run build && npm start`: temporarily throwing inside an existing
      page (verification step, reverted after) renders the branded
      `error.tsx` page, not Next's default overlay/stack trace.
- [ ] Temporarily throwing inside `RootLayout` (verification step, reverted
      after) renders `global-error.tsx`.
- [ ] Neither boundary displays the raw error message or stack to the user in
      production mode; both `console.error` the underlying error server-side.
- [ ] Existing `not-found.tsx` and `forbidden.tsx` behavior is unchanged.
- [ ] `npm run build` passes clean.
