# PostHog Analytics Integration — Spec

## Objective

Instrument Provenance (pre-launch) with PostHog Cloud (free tier) to answer two
questions once real users arrive:

1. Where do users drop off / how well do they retain over time?
2. Which core pages/features are used most vs. least?

Target user: the product owner reviewing the PostHog dashboard, not end users.
Success = after instrumentation, opening the PostHog project shows accurate
page-view counts per core route, a working signup→creation funnel, and a
retention chart, all keyed to real user IDs.

This spec assumes a PostHog Cloud account and project API key already exist.
It does not cover account creation or key provisioning.

## Requirements

**Must-have:**

1. Install `posthog-js` and initialize it client-side (app router: a small
   client component/provider mounted in the root layout), using
   `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` env vars.
2. Disable PostHog's default autocapture pageview-on-load double counting
   with the Next.js App Router by manually firing `$pageview` on route change
   (App Router doesn't emit a native event PostHog can hook automatically).
3. Call `posthog.identify(userId)` immediately after a successful login and
   immediately after successful signup, using the app's existing internal
   user ID (not email) as the distinct ID.
4. Call `posthog.reset()` on logout, so the next session doesn't inherit the
   previous user's identity.
5. Track page views for exactly these routes (manual `$pageview` capture is
   fine as long as every one of these fires when visited):
   - `/login`, `/signup`, `/signup/username`
   - `/[username]` (public profile view)
   - `/projects`, `/projects/new`, `/projects/[id]`
   - `/(protected)/projects`, `/(protected)/projects/new`, `/(protected)/projects/[id]`
   - `/(protected)/my-work`
   - `/(protected)/profile`, `/(protected)/profile/edit`, `/(protected)/profile/canvas`
   - `/(protected)/account`
6. Explicitly exclude from tracking: `/forgot-password`, `/reset-password`,
   `/verify-email`, `/terms`, `/privacy`, and everything under
   `/(protected)/admin/**`. These pages must not init or must be filtered out
   so they don't pollute the popularity dashboard.
7. Fire three custom funnel-step events in addition to pageviews, to support
   the signup→creation funnel independent of which route names change later:
   - `signup_completed` (after account creation succeeds)
   - `project_created` (after a new project is successfully saved)
   - `canvas_edited` (after the first save/edit action inside the canvas
     editor for a given project)
8. Set up in the PostHog Cloud dashboard (documented as exact steps, since
   the user will configure these manually in the UI):
   - **Insight — Page popularity**: a Trends insight, breakdown by `$pathname`
     (or the manually-set page key), filtered to the in-scope routes above,
     showing count of `$pageview` events over the last 30 days, sorted
     descending. This answers "which pages are most/least visited."
   - **Insight — Retention**: a Retention insight using "any event" or
     `$pageview` as both the starting and returning event, cohort by day of
     first `identify`d event, weekly retention view, 8-week window.
   - **Insight — Creation funnel**: a Funnel insight with ordered steps
     `signup_completed` → `project_created` → `canvas_edited`, conversion
     window of 7 days, to show exact drop-off percentage between each step.
   - All three saved to a single new PostHog Dashboard named
     "Provenance — Core Metrics."

**Explicitly deferred (not in this build):**
- Session replay / heatmaps.
- Feature flags / experiments.
- Server-side event capture via `posthog-node` (e.g. from tRPC procedures or
  cron jobs) — only client-side page/feature usage is in scope for now.
- Per-sub-feature event granularity beyond the three funnel events above
  (e.g. tracking individual canvas block types) — page-view counts per route
  are the agreed popularity signal, not fine-grained interaction tracking.
- GDPR/consent banner or cookie-consent gating — acceptable to defer since
  the app is pre-launch with no real users yet, but must be revisited before
  public launch.

## Constraints

- Stack: Next.js App Router, TypeScript. Use `posthog-js` (client SDK only,
  per the deferred server-side scope above).
- PostHog Cloud, free tier — no self-hosting, no EU-hosted instance
  requirement stated.
- Env vars (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`) must be
  read from environment, never hardcoded, and must not be committed to git.
- Must not fire any PostHog events from excluded routes (admin, legal,
  password-reset/verify-email flows) — this is a hard requirement, not a
  nice-to-have, since it would corrupt the popularity comparison.
- Must not break existing auth flows, SSR, or add a client-side crash if
  `NEXT_PUBLIC_POSTHOG_KEY` is unset (e.g. in local dev without a key
  configured) — PostHog init should no-op gracefully rather than throw.
- No new heavy dependencies beyond `posthog-js`.

## Edge Cases

| Situation | Expected behavior |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` env var missing/empty (local dev) | PostHog client does not initialize; no console errors; app functions normally with zero tracking calls made. |
| User navigates client-side between two in-scope routes (App Router soft nav) | A `$pageview` fires for each route change — not just on hard reload. |
| User visits an excluded route (e.g. `/admin/users`) | No `$pageview` or custom event fires. |
| Anonymous user (not logged in) visits a public profile page (`/[username]`) | Pageview still tracked (route is in-scope and public), but no `identify()` call has been made yet — event attributed to anonymous distinct ID until they log in. |
| User logs out mid-session | `posthog.reset()` called; any subsequent activity in that browser is tracked as a new anonymous user, not merged with the previous identity. |
| User creates a project but never opens the canvas editor | `signup_completed` and `project_created` fire; `canvas_edited` does not — funnel correctly shows drop-off at that step. |
| Ad blocker / browser blocks PostHog script | App must not crash or hang; tracking calls silently fail (posthog-js's default behavior), rest of app unaffected. |

## Definition of Done

- [ ] `posthog-js` installed and initialized in a client component mounted at
      the root layout, gated on `NEXT_PUBLIC_POSTHOG_KEY` being present.
- [ ] Manual `$pageview` capture fires on every App Router route change for
      all in-scope routes listed in Requirement 5, verified by checking
      PostHog's Activity/Live Events view while navigating the app locally.
- [ ] Visiting each excluded route (Requirement 6) produces zero PostHog
      network requests, verified via browser devtools Network tab.
- [ ] `posthog.identify(userId)` fires after login and after signup, verified
      by checking the PostHog Persons list shows the app's real user ID (not
      an anonymous UUID) after test login.
- [ ] `posthog.reset()` fires on logout, verified by checking a new anonymous
      distinct ID is used for events after logging out and back in as a
      different user.
- [ ] `signup_completed`, `project_created`, and `canvas_edited` custom events
      all appear in PostHog's event list after manually performing each
      action once.
- [ ] PostHog Cloud dashboard "Provenance — Core Metrics" exists containing
      the three configured insights (Page popularity, Retention, Creation
      funnel) exactly as specified in Requirement 8.
- [ ] App runs locally with `NEXT_PUBLIC_POSTHOG_KEY` unset and produces no
      console errors or crashes related to PostHog.
- [ ] No PostHog API key/secret committed to git (confirm `.env` files
      remain gitignored).
