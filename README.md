# Provenance

Provenance is a talent-scouting platform where engineers are discovered through real, verifiable work instead of resumes.

## Quickstart

### Prerequisites

- Node.js 20 LTS or newer
- npm
- A free Supabase project

### Install

From the repository root in PowerShell, install the dependencies:

```powershell
npm install
```

### Configure the environment

Create the local environment file:

```powershell
Copy-Item .env.example .env
notepad .env
```

In the Supabase dashboard, open **Settings → Database → Connection string** and set both database variables:

- `DATABASE_URL`: copy the **Transaction pooler** connection string, which uses port `6543`.
- `DIRECT_URL`: copy the **Direct connection** string, which uses port `5432`.

Replace the password placeholder in each URL with the database password for the project. If the password contains URL-reserved characters, URL-encode it. Also replace the remaining clearly marked auth placeholders. Generate `AUTH_SECRET` with:

```powershell
npx auth secret
```

The generated NextAuth scaffold uses Discord credentials. Create an application in the Discord Developer Portal and put its application ID and client secret in `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`.

`.env` is gitignored and must never be committed. `.env.example` contains placeholders only.

### Create the database schema

Push the generated NextAuth schema to an empty Supabase database:

```powershell
npx prisma db push
```

Prisma uses `DIRECT_URL` for this command and `DATABASE_URL` for application traffic.

### Run locally

```powershell
npm run dev
```

Open `http://localhost:3000/`. The page should show: “Engineers discovered through real work — not resumes.”

### Build and test

```powershell
npm run build
npm test
```

`npm run build` performs the production build and type checking. `npm test` runs the Vitest unit suite once and returns a nonzero exit code if a test fails.
