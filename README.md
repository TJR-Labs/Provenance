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

Replace the password placeholder in each URL with the database password for the project. If the password contains URL-reserved characters, URL-encode it. Generate `AUTH_SECRET` with:

```powershell
npx auth secret
```

`ADMIN_PASSWORD` is optional. Set it to choose the initial admin password, or leave it empty to have the seed command generate and print a random password once.

`.env` is gitignored and must never be committed. `.env.example` contains placeholders only.

### Create the database schema

Push the Prisma schema to an empty Supabase database:

```powershell
npx prisma db push
```

Prisma uses `DIRECT_URL` for this command and `DATABASE_URL` for application traffic.

### Seed the administrator

Seed the first administrator after creating the schema:

```powershell
npx prisma db seed
```

The seed creates `admin` only when the database contains no users. If `ADMIN_PASSWORD` is unset, copy the random password printed by this first seed; it is not printed again after a user exists. If `ADMIN_PASSWORD` is set, use that value and no plaintext password is printed.

### Provision accounts

There is no self-signup flow. Sign in at `http://localhost:3000/login` as the seeded administrator, open **Users** in the navigation, and use `/admin/users` to create `COMPANY`, `ENGINEER`, or additional `ADMIN` accounts. Give each initial password to its user out-of-band. A company name is required for `COMPANY` accounts.

Signed-in users can change their own password from **Account** in the navigation. The current password is required.

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
