# Content Visibility Controls — Spec

## Objective

Today every non-banned user's profile and every project is fully public: it
renders at `/<username>`/`/projects/[id]`, and shows up in the discovery
feed and category/hashtag search (`discoverProjects`, `getPublicProfile`,
`getPublicProject`, `listProjectsByUsername` in `src/server/projects.ts` and
`src/server/profiles.ts` all filter only on `user: { banned: false }`).
There's no way for a user to keep something off the main feed while staying
public, or to hide a profile or project entirely.

This spec adds three independent visibility controls, from mildest to
strictest:
1. **Feed opt-out** (per project) — stays public everywhere, just excluded
   from the main discovery feed listing.
2. **Private profile** — the whole profile and everything on it is blocked
   from every visitor except the owner.
3. **Private project** — one specific project is blocked from every visitor
   except the owner, independent of the profile's own visibility.

Success looks like: a user can keep a work-in-progress project out of the
main feed without hiding it, or lock down their whole profile, or hide one
project, and each control does exactly what it says and nothing more.

## Requirements

### Feed opt-out (per project)
1. `Project` gains a boolean, default `false` (included in the feed by
   default), toggled from the project create/edit form
   (`project-form.tsx`/`projects/actions.ts`) — e.g. "Include in the main
   discovery feed."
2. `discoveryRouter.list`'s **unfiltered** call (no `category` or `hashtag`
   input — the main feed listing) excludes projects with this flag set.
3. `discoveryRouter.list` calls **with** a `category` or `hashtag` filter
   (search/filter, per `portfolio-platform.md` Requirement 22) include
   feed-opted-out projects — the flag only affects the bare main-feed
   listing, not category/hashtag search results.
4. The project's own page (`/projects/[id]`) and its listing on the owner's
   profile (`/<username>`, `/my-work`) are unaffected by this flag — it only
   changes discovery-feed inclusion.

### Private profile
5. `User` gains a boolean, default `false`, toggled from `/profile/edit`
   (e.g. "Make my profile private").
6. When `true`, every route that resolves a profile or its projects for a
   non-owner — `getPublicProfile`, `getPublicProject` (for any project
   belonging to that user), `listProjectsByUsername`, `discoverProjects`,
   `listPopularHashtags` — excludes that user's content for any viewer other
   than the profile owner themself, mirroring the existing `banned: false`
   filter pattern in those functions.
7. A non-owner visiting `/<username>` of a private profile sees an explicit
   "this profile is private" page (distinct copy, not the generic
   not-found page) — confirming the username exists without revealing any
   profile content.
8. A non-owner visiting `/projects/[id]` for a project belonging to a
   private profile gets the existing not-found behavior (matches how an
   unowned/nonexistent project already 404s — no special "private" messaging
   needed at the individual-project level when the block is caused by
   profile-level privacy).
9. The profile owner sees their own profile and projects completely
   normally when signed in and viewing their own content (`/<username>`,
   `/profile/edit`, `/profile/canvas`, `/my-work`, `/projects/[id]/edit`) —
   privacy only affects how the content appears to others.

### Private project
10. `Project` gains a second boolean, independent of the feed-opt-out flag,
    default `false`, toggled from the project create/edit form (e.g. "Make
    this project private — only visible to you").
11. When `true` on a project whose owner's profile is otherwise public, that
    one project is excluded from: the owner's public profile listing, the
    discovery feed, category/hashtag search, and direct navigation to
    `/projects/[id]` by anyone but the owner (existing not-found behavior).
12. This is project-only granularity — there is no separate control for
    hiding individual media items within an otherwise-visible project; a
    project's media is all-visible or (via this flag) all-hidden together
    with the rest of the project.
13. The project owner continues to see and edit their own private project
    normally (`/projects/[id]/edit`, `/my-work`, canvas placement while
    editing).

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres.
- Extend the existing `banned: false` filter pattern already present in
  `getPublicProfile`, `getPublicProject`, `listProjectsByUsername`,
  `discoverProjects`, and `listPopularHashtags` — add `private: false`
  (profile-level and/or project-level as applicable) alongside it in the
  same `where` clauses, rather than introducing a parallel filtering
  mechanism.
- Functions/pages that need an owner-bypass (profile/project remain fully
  visible to their own owner) must be given the viewing session's user id
  and branch on it — do not simply hide the owner-bypass behind a second,
  duplicate query function.
- A private profile's or private project's content must not leak through
  any *other* existing public surface not explicitly covered above (e.g. if
  `listPopularHashtags` or any future public listing reads `Project`
  directly, it must also respect both flags) — the intent is "nothing
  available to the public," not "nothing available on the two main pages."
- No change to `banned` handling, moderation/report flows, or unrelated
  existing infrastructure (auth, rate limiting, security headers, CI
  pipeline) is required or expected by this spec.

## Edge Cases

- **Private profile with a project that also has feed-opt-out or
  private-project set**: profile-level privacy is strictly stricter and
  wins — the project is invisible to non-owners regardless of its own
  flags' values.
- **Feed-opted-out project on an otherwise fully public profile**: fully
  visible on the profile page, on `/projects/[id]`, and in category/hashtag
  search; absent only from the bare/unfiltered main feed listing.
- **User makes their profile private after it was already indexed/linked
  externally**: any existing direct link to `/<username>` now shows the
  "private" message instead of content immediately — no caching/delay
  requirement beyond normal request-time evaluation.
- **User makes a single project private while their profile stays public**:
  that project disappears from their own profile's project listing for
  other visitors (the profile itself still renders normally, just with one
  fewer visible project) and from feed/search; the profile owner still sees
  it listed (e.g. marked "Private") when viewing their own profile/my-work.
- **Signed-in visitor (not the owner) viewing a private profile or private
  project**: treated identically to a signed-out visitor — being
  authenticated does not grant access to someone else's private content.
- **Admin viewing a private profile/project**: no new admin-bypass tooling
  is added by this spec; existing admin moderation capabilities
  (`specs/portfolio-platform.md` Moderation section) are unaffected but this
  spec does not extend them to browse private content that hasn't been
  reported through some other channel.
- **Reporting a private profile/project**: since non-owners can't view
  private content, the existing report action isn't reachable for it in
  normal use — no special-case handling required beyond the flags already
  blocking the view.

## Definition of Done

- [ ] A project's "include in main feed" flag defaults to included; toggling
      it off removes it from the unfiltered `discoveryRouter.list` result
      but not from category/hashtag-filtered results, verified by a test.
- [ ] A private profile is fully inaccessible to non-owners: `/<username>`
      shows an explicit "private" message, the user's projects are absent
      from the feed/search, and `/projects/[id]` for any of their projects
      404s for non-owners, verified by tests.
- [ ] The profile owner sees their own private profile and its projects
      completely normally when signed in, verified by a test.
- [ ] A private project is excluded from its owner's public profile
      listing, the feed, and category/hashtag search, and 404s at
      `/projects/[id]` for non-owners, while the owner can still view and
      edit it normally, verified by tests.
- [ ] Profile-level privacy overrides project-level flags (a private
      profile's projects are hidden regardless of their own flags),
      verified by a test.
- [ ] `listPopularHashtags` and any other existing public listing exclude
      private-profile and private-project content, verified by a test.
- [ ] `npm run build` and `npm test` pass with no regression to existing
      discovery, profile, and project tests.
