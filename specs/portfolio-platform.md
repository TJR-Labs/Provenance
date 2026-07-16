# Portfolio Platform — Spec

## Objective

Pivot Provenance from a B2B recruiting/scouting tool into a general-purpose
portfolio and discovery platform. Students (the primary audience) and hobbyists
often have no easy way to showcase varied project work — software, art,
hardware, awards — without building their own website. This platform gives
them an easy place to post that work in a standardized-but-customizable format,
and lets anyone browse and discover what others have built.

Success looks like: a student can sign up, build a portfolio of several
projects across different fields in minutes using the default layout, opt into
customizing the look if they want, and have that portfolio be publicly
shareable and discoverable by category/hashtag — without writing any code.

## Requirements

### Accounts & access
1. Any visitor (no account) can browse the discovery feed, search/filter
   results, and view any public profile or project.
2. Creating, editing, or deleting a profile or project requires a signed-in
   account.
3. Self-signup is open (no more admin-provisioned-only accounts). Signup
   requires choosing a username, which must be unique and is validated for
   uniqueness at signup time.
4. Each user has exactly one role tier relevant to this spec: standard user or
   admin (see Moderation). The existing `ADMIN`/`COMPANY`/`ENGINEER` role model
   is replaced — `COMPANY` and `ENGINEER` are removed.
5. Existing login security infrastructure (login attempt lockout, rate
   limiting) is retained unchanged for the new signup/login flow.

### Removal of the recruiting domain
6. Remove entirely: `Brief`, `Submission`, `RubricCriterion`, `Score`,
   `Message` Prisma models and all associated pages, routes, and tRPC
   procedures (brief posting, submission, scoring/evaluation, scouting table,
   outreach messaging, engineer inbox).
7. Remove the `BriefDomain` and `BriefStatus` enums and all UI/copy referencing
   "briefs," "scouting," "evaluation," or "companies discovering engineers."

### Projects
8. A project has: title, description, one or more images/videos, zero or more
   external links, exactly one category (see Categories), and zero or more
   free-form hashtags.
9. Media on a project can be either an uploaded file (image or video, stored
   in file storage) or an external URL (e.g. a YouTube link) — both are
   supported, and a project can mix both.
10. A user can create, edit, and delete their own projects. Projects belong to
    exactly one user.

### Categories
11. Categories are a fixed, curated list representing job types/majors (e.g.
    Software Engineer, Mechanical Engineer, Architect, Artist, Robotics
    Engineer). The list is defined in code (enum or seed-backed table), not
    user-editable at runtime.
12. Each project has exactly one category, chosen by the user from the fixed
    list at creation time.
13. A user's profile displays the distinct set of categories derived from
    their own projects' categories — this is computed from project data, not
    set directly on the profile.
14. Awards and similarly small accomplishments are represented as ordinary
    projects (tagged with a category and/or hashtags like `#award`), not as a
    separate data model.

### Portfolio customization
15. Every profile and project renders with a sensible default layout/theme
    with no customization required.
16. A user can customize their overall profile page: reorder/choose sections
    (layout blocks), pick a theme (colors/fonts from a supported set), and
    supply custom CSS that is scoped to their own profile page only.
17. A user can independently choose a display layout for how an individual
    project renders (e.g. which layout block/template it uses).
18. Custom CSS is the only user-supplied code accepted. Arbitrary HTML or
    JavaScript/TypeScript authored by users is explicitly out of scope (see
    Constraints) — this is not a code-execution sandbox.

### Profile
19. A profile has: display name, bio, school/affiliation, external links
    (e.g. GitHub, LinkedIn, personal site), and a profile picture.
20. Every profile has a public URL of the form `/<username>`, viewable without
    an account.

### Discovery
21. A browsable feed/discovery page lists projects (or profiles) for
    unauthenticated and authenticated visitors alike.
22. Search/filter by category and by hashtag is available on the discovery
    page.

### Moderation
23. Any project or profile has a "report" action available to any visitor
    (account required to submit a report, consistent with requirement 2's
    intent that only accounts create content — reports are user-attributed).
24. Admins can view reported content, remove any project or profile, and ban
    (deactivate) a user account.

### Explicitly deferred (not in this spec)
25. Social interactions — following users, likes, and comments — are
    deferred to a later spec.
26. Arbitrary/sandboxed HTML, JS, or TS execution within a portfolio is
    deferred; scoped custom CSS is the ceiling for this spec.

## Constraints

- Keep the existing stack: Next.js 15, tRPC, Prisma with Supabase Postgres,
  NextAuth, Tailwind, Vitest, deployed on Vercel via the existing
  `vercel-build` migration flow.
- Add a file storage backend for uploaded images/video. Supabase Storage is
  the natural fit since Supabase is already the Postgres provider (free tier,
  no new external account needed).
- No arbitrary user-authored HTML or JavaScript/TypeScript is rendered or
  executed for other visitors. User-supplied CSS must be scoped so it cannot
  affect any DOM outside the user's own profile/project rendering (e.g. via a
  container class/selector prefix or shadow-DOM-style isolation), and must
  not be able to load external resources that bypass this scoping.
- Existing domain-agnostic infrastructure (login rate limiting, security
  headers, error boundaries, CI pipeline, migration-on-deploy) is preserved
  and must keep working after the domain model changes.
- Uploaded file size/type limits must be enforced server-side (not just in
  the UI) to prevent abuse of storage.
- This is a refactor of an existing production-shaped codebase, not a
  greenfield rewrite: existing migrations for removed models should be
  superseded by new migrations that drop them cleanly, not left as dead
  tables.

## Edge Cases

- **Duplicate username at signup**: reject with a clear inline error before
  account creation; username uniqueness is enforced at the database level as
  well as validated pre-submit.
- **Project with no media**: allowed to save (media is not mandatory), but
  the default layout must render sensibly without an empty image slot looking
  broken.
- **Profile with zero projects**: the profile page renders (name/bio/links
  still visible) with an empty/"no projects yet" state instead of a blank or
  broken feed section; the derived category list is empty, not an error.
- **Invalid/oversized file upload**: rejected server-side with a specific
  error (wrong file type, exceeds size limit); the project save does not
  silently drop the file or corrupt the project.
- **External media link that's unreachable or invalid**: the project still
  saves; the broken embed degrades to a plain link rather than breaking the
  page render.
- **Malicious custom CSS** (e.g. `position: fixed` overlay attempting to
  cover the whole page, `@import` of external stylesheets, selectors
  targeting elements outside the user's own container): sanitized or scoped
  so it cannot escape the user's own page region or exfiltrate data via
  CSS-based tricks.
- **Reported content while under review**: reported projects/profiles remain
  visible to the public until an admin acts (no automatic hiding), unless the
  admin explicitly removes them.
- **Banned user**: their profile and projects stop being publicly viewable
  (or are clearly marked removed), and they can no longer sign in to create
  or edit content.
- **Category removed/edited in the fixed list** (future maintenance case):
  existing projects referencing a retired category keep their historical
  value rather than erroring; this spec ships with the initial fixed list
  static and not user-editable.
- **Migration of existing data**: existing `User` rows (former
  `COMPANY`/`ENGINEER`/`ADMIN`) and any existing scouting-domain rows are
  handled by the removal migration; there is no requirement to preserve or
  migrate `Brief`/`Submission`/`Message` data into the new project model.

## Definition of Done

- [ ] `Brief`, `Submission`, `RubricCriterion`, `Score`, `Message` models,
      their routes/pages, and the `BriefDomain`/`BriefStatus` enums are
      removed from the schema and codebase; a migration drops the
      corresponding tables.
- [ ] `COMPANY` and `ENGINEER` roles no longer exist; signup creates a
      standard user account without admin provisioning.
- [ ] A new user can self-sign-up choosing a unique username, is rejected
      with a clear error on a duplicate username, and can sign in
      immediately after.
- [ ] A signed-in user can create a project with title, description, at
      least one image (via upload) and at least one image/video via external
      link, one or more links, one category from the fixed list, and one or
      more hashtags — and it saves and renders correctly.
- [ ] A signed-in user can edit and delete their own project.
- [ ] A signed-out visitor can view any public profile at `/<username>` and
      any project without being prompted to log in.
- [ ] A user's profile shows the correct derived set of categories based only
      on their current projects, updating when projects are added/removed.
- [ ] A user can reorder/select profile layout sections, choose a theme, and
      add custom CSS that visibly changes their own profile without any
      style leaking onto other pages or other users' profiles.
- [ ] A user can select a display layout for an individual project.
- [ ] The discovery/feed page lists projects for both signed-in and
      signed-out visitors, and filtering by category and by hashtag returns
      correct, narrowed results.
- [ ] Any visitor with an account can report a project or profile; an admin
      can see reported content and remove it or ban the reporting-eligible
      user (the offending user), and both actions take effect immediately
      (removed content stops rendering publicly; banned user can't sign in).
- [ ] Uploading a file above the size limit or of a disallowed type is
      rejected server-side with a clear error, verified by a test.
- [ ] Existing login rate-limiting/lockout, security headers, error
      boundaries, and CI pipeline (lint/typecheck/test/build) all still pass
      against the refactored codebase.
- [ ] `npm run build` and `npm test` pass with no references to the removed
      recruiting domain remaining in code, types, or tests.
