# Staging deployment

This repository is prepared for a public staging environment. No cloud service was created from this workspace, and no deployment has been verified.

Stop at the manual checkpoint below until the accounts exist and you approve the first deploy. Do not add a payment method while you are staying on the free plans.

## Architecture

```text
Browser
  -> Vercel (Vite static build, Hobby plan if the project is personal and non-commercial)
       /api/* rewritten to the Render origin after you set the host
  -> Render free web service (Node.js, Express, root directory backend)
  -> Aiven for MySQL free tier (Prisma, provider mysql)
```

Jenkins stays on your machine. It builds, tests, and, only after two confirmations plus a manual approval, calls a Render deploy hook. It does not open a public Jenkins port.

The browser should keep talking to the Vercel host. Vercel forwards `/api` to Render, so the session cookie stays on the frontend host. `COOKIE_SAMESITE=lax` is the setting in `render.yaml` for that layout.

Use a direct `VITE_API_BASE_URL` only if you accept a split origin. That layout needs `COOKIE_SAMESITE=none` and HTTPS. Browsers can block that cookie as a third-party cookie. A custom domain with `app.example.com` and `api.example.com` would be same-site, but buying a domain is a separate cost and is not part of this setup.

## What is free, paid, or manual

Checked against provider documentation on 31 October 2026. Plans change. Confirm the prices in each dashboard before you click Create.

| Piece | Service | Cost today | Action |
| --- | --- | --- | --- |
| Git | GitHub repository already in use | Free for this public repo | Push the `deployment/staging` branch yourself |
| Frontend | [Vercel Hobby](https://vercel.com/docs/plans/hobby) | $0 for personal, non-commercial use. Included usage includes 100 GB fast data transfer and 1 million CDN requests a month. Exceeding a Hobby limit pauses that feature until the window resets. | Create the project by hand. Commercial use, including a site built for an employer or client, requires Pro at $20 per month. |
| API | [Render Free web service](https://render.com/docs/free) | $0 instance with 512 MB RAM. It sleeps after 15 minutes without traffic and takes about a minute to wake. 750 free instance hours per workspace per month. | Create the service by hand on the Free plan. Do not select a paid compute row. The next paid size listed on the pricing page starts at $7 per month. |
| Database | [Aiven for MySQL free tier](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier) | $0, no credit card required to sign up. One node, 1 CPU, 1 GB RAM, 1 GB disk, backups, `max_connections` 76. Aiven may power the service off after inactivity. | Create the MySQL service by hand. Render does not offer MySQL. Render Postgres is a different engine and its free databases expire. |
| Pipeline | Existing local Jenkins | No new Jenkins host | Keep it off the public internet |
| Domain | None | A custom domain is optional and usually paid | Do not buy one unless you decide to |

Render's Hobby workspace can bill bandwidth or build minutes if a payment method is on the account and usage passes the included amount. If no payment method is present, Render's free-tier document says it suspends free services or disables builds instead of charging. Do not add a card for this staging environment.

## Manual checkpoint

Do these steps yourself. Do not paste passwords or tokens into chat, git, or the frontend.

1. Sign in to GitHub with the account already used by this machine. Create no new token for this task.
2. Create a Vercel Hobby account only if this deploy is a personal, non-commercial project. Otherwise stop and decide whether to pay for Pro.
3. Create a Render account and stay on the Free web-service plan. Do not add a payment method.
4. Create an Aiven account and a free MySQL service. Download the project CA certificate. Store it as a Render secret file, not in git.
5. Create the Jenkins credentials listed in [JENKINS_SETUP.md](JENKINS_SETUP.md).
6. Return here and apply the service settings below. The first Render deploy is the approval to run `prisma migrate deploy` against that empty staging database.

## Frontend on Vercel

1. Import `akash7151/Healthcare_Management_System_Playwright_Javascript`.
2. Set the production branch to `deployment/staging` after that branch is on GitHub.
3. Set the root directory to `frontend`.
4. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
5. Leave `VITE_API_BASE_URL` empty for the same-origin proxy layout.
6. After the Render URL exists, replace `frontend/vercel.json` with the rewrite in `frontend/vercel.proxy.example.json`, using the real `*.onrender.com` host and no trailing slash. Put the `/api/:path*` rewrite before the SPA rewrite.
7. Redeploy the frontend after that file is pushed. `vercel.json` sends other paths to `index.html` so React Router can open `/patients` and `/billing` directly.

`VITE_` variables are compiled into the public JavaScript bundle. The only allowed value is the API origin. Never put a password, session secret, or database URL in one.

Local development is unchanged when `VITE_API_BASE_URL` is empty. Vite proxies `/api` to `http://localhost:4000`.

## API on Render

`render.yaml` is a blueprint, not an active service. `autoDeploy` is false and `plan` is `free`.

1. In the Render dashboard, confirm `singapore` is offered. Edit `region` in `render.yaml` if you need a different free region, and use the same region in Aiven.
2. Create a Blueprint from this repository and the `deployment/staging` branch, or create a web service with the same settings:
   - Root directory: `backend`
   - Build: `npm ci && npx prisma generate && npm run build`
   - Pre-deploy: `npx prisma migrate deploy`
   - Start: `npm start`
   - Health check path: `/api/health`
   - Instance type: Free
3. Bind to `0.0.0.0`. The server already listens on `0.0.0.0` and `process.env.PORT` (fallback `4000`). Render sets `PORT`.
4. Add the secret file for the Aiven CA. A typical path is `/etc/secrets/aiven-ca.pem`.
5. Set the environment variables in the table below. Mark `DATABASE_URL`, `SEED_PASSWORD`, and the CA file as secrets.
6. Deploy once, from the dashboard or from the Jenkins approval stage. The pre-deploy command applies the two committed MySQL migrations. It does not drop data and it does not seed.

The committed migrations are `20261029120000_init` and `20261029140000_clinical_workflow`. Both are additive. `migration_lock.toml` says `mysql`. If Render reports a checksum mismatch or a missing migration history on a database that already has tables, stop. Do not run `prisma migrate dev`, `prisma db push`, or `prisma migrate reset`.

## Database

Use a new empty Aiven MySQL database named for staging, for example `healthcare_staging`. Do not restore a local or production dump into it.

Aiven shows a Service URI similar to `mysql://USER:PASSWORD@HOST:PORT/defaultdb?ssl-mode=REQUIRED`. Prisma does not use `ssl-mode`. Remove that parameter. Keep certificate verification on:

```text
mysql://USER:PASSWORD@HOST:PORT/DATABASE?sslcert=/etc/secrets/aiven-ca.pem&sslaccept=strict&connection_limit=5&pool_timeout=20
```

- URL-encode reserved characters in the password.
- `sslaccept=strict` verifies the certificate. Prisma's default without that parameter is `accept_invalid_certs`, which this deployment must not use.
- `connection_limit=5` stays under the free tier's 76 connections when the free Render instance is the only client.
- Do not add `sslaccept=accept_invalid_certs`.

Aiven free services include backups. Before the first schema deploy, and before every later migration, download a backup from the Aiven console. Restoration is a manual console action: power the service on if Aiven stopped it, restore the backup you chose, then redeploy an application build that matches that schema. This repository does not contain a restore script, and it must not gain one that runs automatically.

Seed fictional data once, from your machine, with the staging URL only in your shell and never in the command echo:

```bash
cd backend
set NODE_ENV=production
set SEED_CONFIRM=synthetic-staging
set SEED_PASSWORD=choose-a-unique-password
set DATABASE_URL=mysql://...
npx prisma migrate deploy
npx prisma db seed
```

The seed refuses to run against a non-local database unless `SEED_CONFIRM=synthetic-staging`. It also refuses the published local demo password for a non-local host. The seed upserts the fictional clinic. It does not delete unrelated rows and it does not import real patients.

`GET /api/ready` is the connectivity check. `GET /api/status` remains an unauthenticated count summary. Do not put patient names or clinical notes in either response.

## Environment variables

### Backend

| Variable | Local | Staging |
| --- | --- | --- |
| `DATABASE_URL` | Local MySQL URL in `backend/.env` | Aiven URL with `sslaccept=strict`, secret |
| `TEST_DATABASE_URL` | Local `healthcare_db_test` | Not used on Render |
| `PORT` | `4000` | Set by Render |
| `NODE_ENV` | `development` | `production` |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Vercel origin, no path |
| `FRONTEND_ORIGINS` | Empty | Extra origins, comma-separated, no wildcards |
| `TRUST_PROXY` | `0` | `1` |
| `COOKIE_SAMESITE` | `lax` | `lax` with the Vercel proxy; `none` only for a split origin |
| `COOKIE_SECURE` | `false` | `true` when the cookie must be marked Secure outside production |
| `CLINIC_TIMEZONE` | `Asia/Kolkata` | `Asia/Kolkata` |
| `LOGIN_ATTEMPT_LIMIT` | `20` | `20` |
| `SEED_PASSWORD` | Unset | Unique staging password, secret |
| `SEED_CONFIRM` | Unset | `synthetic-staging` only while seeding |

`NODE_ENV=production` marks the session cookie Secure. Login returns a generic error and does not include a password-reset token. The process handles `SIGINT` and `SIGTERM` by closing the HTTP server and disconnecting Prisma.

### Frontend and Playwright

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Empty for the proxy. Otherwise the API origin, baked into the bundle at build time. |
| `BASE_URL` | Playwright site origin. Defaults to `http://localhost:5173`. |
| `API_BASE_URL` | Playwright API origin. Defaults to `BASE_URL` so `/api` can go through the proxy. |
| `E2E_PASSWORD` | Overrides the fictional local password. Required for staging smoke. |
| `E2E_ADMIN_EMAIL` | Defaults to `asha.menon@example.test` |
| `E2E_RECEPTIONIST_EMAIL` | Defaults to `lata.kulkarni@example.test` |
| `E2E_BILLING_EMAIL` | Defaults to `vikram.desai@example.test` |
| `E2E_PATIENT_EMAIL` | Defaults to `ravi.nair@example.test` |

### Jenkins credential IDs

These are names for the Jenkins credential store, not values:

- `render-deploy-hook-staging`
- `staging-frontend-url`
- `staging-api-url`
- `healthcare-e2e-password`
- `healthcare-test-database-url`

## Rollback

1. Restore the Aiven backup taken before the deploy if a migration must be undone. Application rollback does not reverse SQL.
2. In Render, roll the free web service back to one of the two previous deploys available on the free plan.
3. Redeploy the matching frontend build on Vercel.
4. Run the smoke command in [PLAYWRIGHT_EXECUTION.md](PLAYWRIGHT_EXECUTION.md).

There is no production service in `render.yaml`. Do not add one in the same step as staging.

## Smoke commands

```bash
node scripts/wait-for-http.js https://YOUR_RENDER_HOST/api/ready
set BASE_URL=https://YOUR_VERCEL_HOST
set API_BASE_URL=https://YOUR_VERCEL_HOST
set E2E_PASSWORD=the-staging-password
npm run test:smoke
```

When the frontend proxies `/api`, `API_BASE_URL` is the Vercel origin, not the Render origin. Use the Render origin for `wait-for-http` so a sleeping free instance can wake before the browser tests start.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| First request fails or returns HTML | The free Render service was asleep. Wait and retry `/api/ready`. |
| Browser signs in and immediately looks logged out | The cookie is cross-site. Use the Vercel `/api` rewrite, or set `COOKIE_SAMESITE=none` on HTTPS. |
| CORS error | `FRONTEND_ORIGIN` must be the exact Vercel origin. No `*`. |
| Prisma SSL error | Use the Aiven CA and `sslaccept=strict`. Remove `ssl-mode=REQUIRED`. |
| `P3009` or checksum mismatch | Stop. Compare `_prisma_migrations` with `backend/prisma/migrations`. Do not reset. |
| Render build cannot find Prisma client | The build command includes `npx prisma generate`. `DATABASE_URL` must be present at build time even though generate does not connect. |
| Vercel deep link 404 | `frontend/vercel.json` rewrite to `index.html` is missing from the deployed commit. |
| Login lockout | Five bad passwords set the fictional user to `LOCKED`. Unlock that row in the staging database or seed again into an empty database. |

## Security checklist

- `.env`, PEM files, and `playwright/.auth` are gitignored.
- `backend/tests/globalSetup.ts` and `backend/vitest.config.ts` used to contain a local MySQL root password. Deleting it from the current files does not remove it from GitHub history. Rotate that MySQL account password.
- The local demo password remains in the seed policy because local development uses it. Do not reuse it on the public URL. Staging seed rejects that password for a non-local host.
- Session cookies are `HttpOnly`. They are `Secure` in production, and `SameSite=None` forces `Secure`.
- CORS allows `FRONTEND_ORIGIN` plus `FRONTEND_ORIGINS` only. Production does not allow private-network origins.
- Helmet is enabled. The API sets `Cross-Origin-Resource-Policy: cross-origin` so a split origin can read JSON.
- Login attempts are limited. The limit is stricter when `NODE_ENV=production`.
- Errors returned to clients on status 500 are generic. The process does not log the database URL on the readiness failure path.
- Staging data is the fictional seed only.
- Jenkins artifacts exclude `.env`, keys, and saved Playwright auth state. Traces can still contain session cookies. Keep the Jenkins job private.
- No email notifier is configured. Add one only after you choose an approved mail server and a credential ID.
