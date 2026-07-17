# Profile Content Editing — Spec

## Objective

`/profile/edit` (`src/app/(protected)/profile/edit/profile-form.tsx`) has two
usability gaps the UX audit flagged directly against the app's "anybody from
any discipline" goal: the External Links field requires typing a
pipe-delimited text format (`Label | https://url`, one per line) that the
canvas editor's own new Link element already replaced with a proper form, and
the Custom CSS field is a raw stylesheet textarea shown to every user with no
indication it requires knowing CSS. The theme picker is also a blind choice —
three named options with no preview.

This spec brings the profile editor's content-editing surfaces up to the same
bar the canvas editor's `LinkPanel` already set, and gates the CSS field
behind a clearly-labeled advanced disclosure instead of removing it (some
users do want it).

## Requirements

1. Replace the "External links" textarea with a repeatable Label + URL row
   form: each row has a Label input and a URL input, a per-row Remove button,
   and an "Add link" control to append a new row. Validate each row's URL
   client-side with the existing `safeExternalUrl` (`src/app/safe-external-url.ts`)
   before allowing save, mirroring the canvas editor's `LinkPanel` exactly —
   reuse the same validation function, do not reimplement it.
2. The stored shape of `User.links` (JSON array of `{label, url}`) does not
   change. This is a replacement of the editing UI only; the server action
   that persists it (`src/app/(protected)/profile/edit/actions.ts`) keeps
   accepting/producing the same shape.
3. The "Custom CSS" field moves behind a collapsed-by-default `<details>`
   disclosure labeled "Advanced: custom CSS." It keeps its existing textarea,
   scoping/sanitization behavior (`sanitizeCustomCss`), and helper text
   unchanged, plus one added worked example line demonstrating the expected
   format (e.g. `.profile-muted { color: #666; }`).
4. The disclosure defaults to **expanded** when the signed-in user already has
   non-empty saved `customCss`, and **collapsed** when it's empty — so an
   existing customization is never hidden from the person who wrote it.
5. Each option in the theme `<select>` (Default dark / Paper light / Indigo
   studio) gains a visual indicator distinguishing it from the others — at
   minimum a small labeled color swatch per option. A live preview pane is
   welcome but not required.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- No change to the profile server action's accepted input shape, to
  `sanitizeCustomCss`, or to `safeExternalUrl` — reuse them as-is.
- No change to `theme` storage (`User.theme: string`) or to the three
  existing theme identifiers (`default`, `paper`, `studio`).
- Swatches/preview must render correctly in both the app's light and dark
  viewer themes (the existing `ThemeToggle`), independent of which profile
  theme is selected.

## Edge Cases

- **Zero links**: form shows only the "Add link" control, no rows.
- **A row with an empty label or an invalid/unsafe URL**: rejected with an
  inline error on that row (same rejection behavior as the canvas `LinkPanel`)
  without blocking the other rows from being saved.
- **A user with previously-saved links in the old pipe-delimited format**:
  since the server already parses stored links into `{label, url}[]` before
  they reach the client (existing `readLinks`-style parsing), the new form
  only ever needs to handle that normalized shape — no legacy raw-text
  migration is required.
- **User has saved Custom CSS, then clears it and saves**: next visit shows
  the disclosure collapsed again (empty means collapsed, regardless of past
  state).
- **Theme swatches on a profile using a custom theme's own scoped CSS**: the
  picker itself lives in the editor chrome, not inside the scoped profile
  preview, so it is unaffected by the user's own `customCss`.

## Definition of Done

- [ ] Profile Links are added, edited, and removed via a Label+URL row form;
      no pipe-delimited textarea remains on `/profile/edit`.
- [ ] Link URL validation happens inline via `safeExternalUrl` before a row
      can be saved, verified by a test with an unsafe URL.
- [ ] Custom CSS is hidden behind a collapsed-by-default disclosure that
      defaults to expanded only when the user already has saved custom CSS.
- [ ] Custom CSS helper text includes one worked example.
- [ ] Each theme option shows a visual swatch/preview distinguishing it from
      the other two.
- [ ] `npm run build` and `npm test` pass with no regression to existing
      profile-edit tests.
