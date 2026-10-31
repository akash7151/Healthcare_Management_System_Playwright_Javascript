# Jenkins setup

The pipeline in the repository `Jenkinsfile` matches the Jenkins service already used for this project: a Windows agent whose Node.js install is `C:\Program Files\nodejs` and is not on the service PATH. Override that location with the `NODE_HOME` environment variable if the install moves.

This file does not assume Jenkins is reachable from the internet. Leave it that way. A GitHub webhook would publish the Jenkins port and needs a separate hardening review, a TLS certificate, and authentication in front of the port. Do not add that exposure as part of staging.

## Prerequisites

- Jenkins 2.4xx or newer with the Pipeline plugin
- Credentials Binding plugin
- Git plugin, when the job uses Pipeline from SCM
- JUnit plugin for `automation/reports/junit/results.xml`
- Timestamper plugin, because the Jenkinsfile uses `timestamps`
- Node.js 22 LTS on the agent (Node.js 20 LTS is also acceptable). The NodeJS plugin is not required
- Google Chrome or the Playwright Chromium download. The pipeline runs `npx playwright install chromium` on Windows and `npx playwright install --with-deps chromium` on Linux
- Local MySQL only for the existing end-to-end stage, via `backend/.env` on the agent. That file stays out of git

No mail plugin is configured. To notify someone, install the Mailer or Email Extension plugin, store the SMTP password as a Jenkins credential, and add a `post` step that uses that credential ID. Do not put the mailbox password in the Jenkinsfile.

## Job

Create a Pipeline job, or update the existing one, with these choices:

1. Pipeline script from SCM.
2. Repository: `https://github.com/akash7151/Healthcare_Management_System_Playwright_Javascript.git`
3. Branch: `deployment/staging`
4. Script path: `Jenkinsfile`
5. Build on the existing local agent. Do not enable "GitHub hook trigger" until Jenkins is deliberately published and locked down.

If the job stays as an inline script with no SCM remote, the Checkout stage still copies `HEALTHCARE_WORKSPACE` (default `D:\Healthcare Management`). That copy is only for the local machine. The Render hook deploys the Git branch, so push the branch before arming a deploy.

The Jenkins username being `admin` does not provide a password. Sign in through the Jenkins UI and store secrets in Credentials. The Jenkinsfile never contains a username or password.

## Credentials

Create Secret text credentials with these exact IDs:

| ID | Value |
| --- | --- |
| `render-deploy-hook-staging` | Render deploy-hook URL for the staging web service |
| `staging-frontend-url` | Vercel origin, no trailing slash |
| `staging-api-url` | Origin Playwright should call for `/api`. Use the Vercel origin when `/api` is proxied. Use the Render origin only for a split-origin deploy. |
| `healthcare-e2e-password` | Staging seed password. The same value as `SEED_PASSWORD`. |
| `healthcare-test-database-url` | Local or CI MySQL URL whose database name ends with `_test` |

Use a credential scope limited to this job. The deploy hook can deploy that one Render service. It is still a secret. The staging database URL belongs on Render, not in Jenkins.

## Parameters

| Parameter | Default | Effect |
| --- | --- | --- |
| `HEALTHCARE_WORKSPACE` | `D:\Healthcare Management` | Copy source when SCM is not configured |
| `RUN_BACKEND_TESTS` | off | Runs `npm test` in `backend` with `healthcare-test-database-url` |
| `RUN_STAGING_SMOKE` | off | Runs `npm run test:smoke` against the staging URLs |
| `DEPLOY_STAGING` | off | Arms the deploy stage |
| `DEPLOY_CONFIRMATION` | empty | Must be exactly `deploy-staging` |

An ordinary build checks out, installs, validates Prisma, generates the client, builds both packages, installs Chromium, and runs `npm run test:e2e`. It does not deploy.

A deploy also requires the "Deploy staging" input inside the running build. Pull-request builds (`CHANGE_ID` / `changeRequest()`) cannot enter that stage. There is no production stage.

The deploy step is `curl` against the hook and nothing else. Render's pre-deploy command runs `prisma migrate deploy`. Jenkins does not run `migrate dev`, `db push`, or a database reset.

## Reports

Successful and failed builds archive:

- `automation/reports/html/**`
- `automation/reports/junit/**`
- on failure, `automation/reports/test-results/**` (screenshots and traces)

The archive excludes `.env`, key material, and `playwright/.auth`. Traces can still contain session cookies from the fictional accounts. Do not publish the Jenkins archive to a public URL.

JUnit publishes `automation/reports/junit/results.xml` when CI mode created it. Backend Vitest does not currently emit JUnit, so that extra pattern is allowed to be empty.

## Local end-to-end database

The Playwright web server reads `backend/.env` from the workspace copy. Keep that file on the agent only. The static-check stage sets a placeholder `DATABASE_URL` when the variable is missing so `prisma validate` and `prisma generate` can run without connecting.

Backend Vitest refuses to start until `TEST_DATABASE_URL` names a database ending in `_test`. It will not target `healthcare_db`.

## Security

- Do not commit the Jenkins home directory.
- Do not reuse the Jenkins admin account as a deployment identity.
- Do not store the Aiven password in a Jenkinsfile parameter. Parameters are visible to people who can read the job.
- Rotate the local MySQL password that was previously committed in `backend/tests/globalSetup.ts` and `backend/vitest.config.ts`. Removing it from the current tree does not erase Git history.
