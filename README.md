# Luris Empower System

Empower is a private, statement-first personal finance application. It imports exported financial files, normalizes transaction history, finds duplicates, reconstructs transfers between owned accounts, and keeps investments separate from ordinary spending.

The current MVP is built around the supplied Deel, ARQ, Brubank, Payoneer, and Alpaca formats. Direct banking APIs are intentionally not required.

## Stack

- Next.js 16 App Router with TypeScript
- Tailwind CSS 4
- Supabase PostgreSQL, Auth, Storage, and Row Level Security
- Radix UI accessibility primitives
- Vitest and Testing Library
- Vercel-compatible Node.js route handlers

## What works

- Drag-and-drop CSV, XLSX, and PDF preview
- Automatic provider detection with a manual override
- Reusable generic column mapping
- Normalized signed amounts, dates, currencies, statuses, transaction kinds, original amounts, and fees
- Dedicated Deel, ARQ, Brubank, Payoneer, and generic adapters
- Exact-file and transaction-level duplicate protection
- Failed, pending, and reversed transaction retention without affecting totals
- Partial, one-to-many, many-to-one, cross-currency, and multi-step transfer suggestions
- Questions for unresolved incoming movements and cash withdrawals
- Secure original-file storage linked to import history
- Whole-batch rollback
- Separate investment schema and Alpaca statement detection

The supplied real files were previewed locally through their adapters. They are not copied into this repository and are not committed. See [statement mapping notes](docs/statement-mappings.md) for the anonymized format analysis.

## Local setup

Requirements:

- Node.js 20.9 or newer
- npm
- A Supabase project
- Supabase CLI if you want to apply migrations from the terminal

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The service-role key is not required for normal imports. Do not expose it to the browser or prefix it with `NEXT_PUBLIC_`.

Apply the schema:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

In Supabase Authentication, enable email sign-in and add these redirect URLs:

```text
http://localhost:3000/auth/callback
https://YOUR_VERCEL_DOMAIN/auth/callback
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`. Statement previews work without Supabase. Confirmation, history, mappings, and rollback require a signed-in Supabase user.

## Database and security

The migration at `supabase/migrations/20260913000000_initial_schema.sql` creates:

- profiles and financial accounts;
- import mappings, batches, and secure file metadata;
- normalized transactions and categories;
- transfer chains with partial allocations;
- Questions Inbox records, expense splits, budgets, and life periods;
- investment accounts, assets, activity, positions, and snapshots;
- a private `statement-files` Storage bucket.

Every user-owned table has Row Level Security enabled. Policies compare `auth.uid()` with the row owner, and statement object paths begin with that user ID. Import routes verify the authenticated user again on the server.

Rollback removes transactions created by the selected batch and marks the batch as rolled back. The original file stays in private storage for audit history.

## Import workflow

1. Open **Imports** and drop a statement.
2. Review the detected institution and account currency.
3. If the file is unfamiliar, map its date, description, amount or debit/credit, currency, status, ID, and type columns.
4. Review warnings and normalized rows.
5. Confirm the import after signing in.
6. The app stores the original file, imports only new rows, opens questions for uncertainty, and rebuilds transfer-chain suggestions.

The checksum prevents a repeated file from creating another batch. Overlapping exports are still safe because provider IDs and transaction fingerprints catch repeated rows.

## Accounting rules

- Only original client payments count as ordinary income.
- Final purchases, fees, and taxes count as spending.
- Owned-account movements remain visible and are excluded from income and expense totals.
- Transfer fees remain separately measurable even when the principal is excluded.
- Unknown credits do not count as income until resolved.
- Investment purchases and sales do not count as ordinary spending or income.
- Dividends and interest use the separate investment-income treatment.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The committed fixtures are anonymized and preserve only the structural characteristics needed to test the adapters.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel as a Next.js project.
3. Add the three public environment values from `.env.local` to the Vercel project. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin.
4. Add the production `/auth/callback` URL to Supabase Authentication redirect URLs.
5. Deploy.

The statement preview and commit handlers use the Node.js runtime and set bounded file sizes and execution durations suitable for Vercel. Supabase provides the database and object storage, so no persistent filesystem is assumed.

## Scope and future integrations

CSV/PDF/XLSX upload remains a permanent integration path. Provider APIs are a future option only when they are official, work with the account type, expose the needed transaction or balance data, support secure least-privilege access, require no banking-password storage, and justify their cost and maintenance.

Do not connect undocumented ARQ or Brubank mobile APIs, intercept app traffic, bypass certificate controls, reverse-engineer authentication, or store mobile session tokens.
