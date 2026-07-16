# Provenance

Provenance is a public portfolio and project-discovery platform. People can share work across disciplines, customize a public profile, and browse projects by category or hashtag.

## Quickstart

Prerequisites: Node.js 20 or newer, npm, and a Supabase project.

```powershell
npm install
Copy-Item .env.example .env
npx auth secret
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Configure the database and Supabase Storage values documented in `.env.example`. Create the public Storage bucket named by `SUPABASE_STORAGE_BUCKET`; uploaded project media and profile pictures use that bucket. The service-role key is server-only and must never be exposed to the browser.

For OAuth sign-in, create a Google OAuth client and a GitHub OAuth App, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. Register these redirect URIs, replacing the origin with each deployed environment:

- `http://localhost:3000/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/github`

The production URIs use the same `/api/auth/callback/google` and `/api/auth/callback/github` paths on the production domain. Keep both client secrets server-only.

The seed creates the first administrator only when the user table is empty. If `ADMIN_PASSWORD` is unset, it prints a generated password once. Everyone else signs up at `/signup` and receives the standard user role.

## Development

Schema changes are committed as new Prisma migrations. Vercel runs `npm run vercel-build`, which applies migrations before building.

```powershell
npm run check
npm test
npm run build
```

The login lockout remains ten failed attempts within fifteen minutes, followed by a fifteen-minute lock. Public visitors can browse `/`, profiles at `/<username>`, and project pages without signing in. Signed-in users can edit their profile, manage projects, and submit reports. Administrators review reports at `/admin/reports`.

The public `/terms` and `/privacy` pages remain structural placeholders and require legal review before launch.
