# Additional Profile Themes — Spec

## Objective

Profiles today choose from three themes (`default`, `paper`, `studio`),
defined as `.profile-theme-*` CSS variable overrides in
`src/styles/globals.css` and picked via a `<select>` in `profile-form.tsx`
(each with a swatch, per `specs/profile-content-editing.md`). Three options
is a thin set for a platform whose whole pitch is letting people
differentiate their portfolio visually.

Success looks like: a user picking a theme has a noticeably wider, more
distinctive set of built-in looks to choose from before ever touching custom
CSS.

## Requirements

1. Add at least 4 new built-in themes (7+ total including the existing 3),
   each a distinct `.profile-theme-<name>` class following the exact pattern
   `paper`/`studio` already use (overriding the same set of CSS custom
   properties those two override — no new properties invented).
2. Each new theme is visually distinct from every existing theme and from
   each other — not a minor hue shift of an existing one. Exact names,
   palettes, and fonts are a build-phase creative decision; the requirement
   is originality and clear differentiation, not a specific list.
3. `profileThemes` (`src/server/users.ts`) and the `themeClasses` map
   (`src/app/[username]/page.tsx`) both gain the new theme identifiers,
   keeping the existing `zod` validation and class-mapping pattern.
4. Every new theme gets a labeled color swatch in the `/profile/edit` theme
   picker, matching the existing swatch treatment for `default`/`paper`/
   `studio` (per `specs/profile-content-editing.md` Requirement 5) — no new
   themes ship without a swatch.
5. Every new theme renders correctly in both the app's light and dark viewer
   modes (`ThemeToggle`), same requirement already in place for the existing
   three.

## Constraints

- Build on the existing stack: Tailwind CSS v4, the existing CSS
  custom-property theming approach in `globals.css`. No new theming
  mechanism, no per-theme JS/config beyond the existing `profileThemes`
  array and `themeClasses` map.
- Fonts used by new themes must come from whatever font-loading mechanism
  the existing themes already use (no new external font host added solely
  for this spec, consistent with the no-arbitrary-external-resource
  constraint already governing custom CSS in `portfolio-platform.md`).
- No change to how a theme is selected, stored (`User.theme: String`), or
  applied — this spec only adds more values to an existing set.

## Edge Cases

- **A profile's stored `theme` value predates this spec** (`default`,
  `paper`, or `studio`): renders exactly as it does today — no re-migration
  needed since old values remain valid members of the expanded set.
- **Theme picker with 7+ options**: the `<select>`/swatch layout remains
  usable and doesn't visually break at the higher option count (wrap or
  scroll as needed, not a fixed-width overflow).

## Definition of Done

- [ ] At least 4 new `.profile-theme-*` classes exist in `globals.css`,
      each overriding the same custom-property set as `paper`/`studio`.
- [ ] `profileThemes` and `themeClasses` include all new identifiers; an
      invalid/removed identifier is still rejected by the existing `zod`
      validation, verified by a test.
- [ ] Every theme (existing + new) has a labeled swatch in the
      `/profile/edit` picker.
- [ ] A profile using each new theme renders distinctly and correctly in
      both light and dark viewer mode, spot-checked manually or via a
      snapshot/visual test.
- [ ] `npm run build` and `npm test` pass with no regression to existing
      theme-related tests.
