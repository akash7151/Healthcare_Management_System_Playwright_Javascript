# Playwright execution

The suite lives in `automation/`. Page objects and the existing chromium project are unchanged in behavior. Configuration is `playwright.config.js`.

## Projects

| Project | What it runs |
| --- | --- |
| `setup` | Signs in the seeded accounts and writes `playwright/.auth/*.json`. That directory is gitignored. |
| `chromium` | `positive.spec.js`, `negative.spec.js`, and `end-to-end.spec.js`. Depends on `setup`. |
| `smoke` | `automation/test/staging-smoke.spec.js` only. Signs in during the test and does not read auth files. |

`npm run test:e2e` selects `chromium`. `npm run test:smoke` selects `smoke`. `npm test` runs every project.

## Environment

`BASE_URL` defaults to `http://localhost:5173`. When that value is local, Playwright starts the backend and frontend dev servers and reuses them if they are already running. Any other `BASE_URL` does not start those servers.

`API_BASE_URL` is optional. The smoke tests call `/api/health` and `/api/ready` on that origin, or on `BASE_URL` when it is unset.

Account passwords come from `E2E_PASSWORD`. When it is unset, the tests use the fictional local seed password. Override the emails with `E2E_ADMIN_EMAIL`, `E2E_RECEPTIONIST_EMAIL`, `E2E_BILLING_EMAIL`, and `E2E_PATIENT_EMAIL` if the staging seed uses different fictional addresses. Do not point these variables at real patients or at production.

The administrator account in the tests is the seeded user `asha.menon@example.test` (Asha Menon, role label Administrator). An older fixture name, `new.admin@example.test`, is not created by the seed.

## Local commands

Start MySQL, migrate, and seed first. Then:

```bash
npm run test:e2e
npm run test:smoke
npm run test:e2e:headed
npm run test:e2e:report
```

HTML output is `automation/reports/html`. With `CI=true`, JUnit is written to `automation/reports/junit/results.xml`. Screenshots are captured on failure. Traces are captured on the first retry locally, and on every failure when `CI=true`. Jenkins sets `CI=true`.

## Staging smoke

The smoke file is read-only aside from signing in and signing out:

- API health and readiness, with retries while a free instance wakes
- Unknown email rejected
- Administrator sign-in and sign-out
- Receptionist can open Patients and Appointments, and cannot open Users or Billing
- Billing staff can open Billing, and cannot open Users or new clinical records
- Patient can open Billing, and cannot open Users

Those checks follow the permissions seeded for `RECEPTIONIST`, `BILLING_STAFF`, and `PATIENT`. They do not create patients, appointments, or invoices. The longer chromium specs still create fictional rows and should stay on the local database.

`npm run test:staging` uses `playwright.staging.config.js`. It runs only `automation/test/staging-smoke.spec.js` against the public staging origin and does not start the local dev servers. The default origin is `https://rounds-cruise-stan-tricks.trycloudflare.com`. Set `STAGING_BASE_URL` when that host changes.

```bash
npm run test:staging
```

```bash
set STAGING_BASE_URL=https://YOUR_STAGING_HOST
set E2E_PASSWORD=the-staging-password
npm run test:staging
```

On PowerShell, set variables with `$env:BASE_URL = "https://YOUR_VERCEL_HOST"` and the same pattern for the other names.

## Isolation

Each full run writes a new id under `automation/test-data/generated/`, which is gitignored. The chromium specs build patient, visit, and invoice values from that run. Smoke tests do not use those factories.

Do not commit `playwright/.auth`. Do not run the chromium project against a shared staging database. It registers patients and records payments.

## Reports and secrets

Open the HTML report locally or from the Jenkins build. Do not upload traces to a public bucket. A failed sign-in trace can include the session cookie for a fictional account. The Jenkinsfile archives reports and excludes `.env` files and the auth directory.
