# Healthcare Management

Local clinic demo for fictional staff and patients. It is not a system of record for real care.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS (`http://localhost:5173`)
- Backend: Node.js, Express, TypeScript (`http://localhost:4000`)
- Database: MySQL 8, database `healthcare_db`
- ORM: Prisma (`provider = "mysql"`)
- Browser tests: Playwright
- Pipeline: Jenkins, with deployment left off until cloud accounts are approved

## Roles

The API enforces these roles. There is no separate receptionist-admin role.

| Role | What that account can do |
| --- | --- |
| `ADMIN` | Every permission, including users and the audit log |
| `DOCTOR` | Patients, schedules, appointments, records, prescriptions, and pharmacy reads |
| `RECEPTIONIST` | Patient registration, doctor reads, and appointments |
| `BILLING_STAFF` | Patient reads, invoices, payments, and reports |
| `PATIENT` | Own-portal reads for patients, appointments, prescriptions, and billing |

## Local setup

MySQL must already be running on `localhost:3306`. Create the application database once if it is missing. Do not run this against a database that holds real patient records.

```sql
CREATE DATABASE healthcare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE healthcare_db_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and `TEST_DATABASE_URL`. Copy `frontend/.env.example` to `frontend/.env.local` only if you need to override the API URL. Leave `VITE_API_BASE_URL` empty so the Vite proxy keeps local requests on `http://localhost:5173`.

From the repository root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
npm run db:validate
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev:backend
npm run dev:frontend
```

`db:migrate` applies the committed migrations with `prisma migrate deploy`. It does not reset existing data.

Local seed accounts use the fictional password recorded in `backend/prisma/seed-policy.ts` (`DemoPass123!`). Use a different password before any public staging deploy. Accounts:

| Email | Role |
| --- | --- |
| asha.menon@example.test | Admin |
| meera.iyer@example.test | Doctor |
| rohan.kapoor@example.test | Doctor |
| lata.kulkarni@example.test | Receptionist |
| vikram.desai@example.test | Billing staff |
| ravi.nair@example.test | Patient `P-10001` |
| nina.dsouza@example.test | Patient `P-10002` |

`P-10003` is a walk-in patient with no portal user. All of these people are fictional.

## API

- `GET /api/health` returns `{ "status": "ok" }`
- `GET /api/ready` returns `{ "status": "ready" }` when MySQL accepts a query, or `503` otherwise
- `GET /api/status` returns database connectivity and aggregate record counts

## Staging

Nothing in this repository has been deployed. Cloud accounts, databases, and DNS are manual steps. Read these before creating any service:

- [Staging deployment](docs/STAGING_DEPLOYMENT.md)
- [Jenkins setup](docs/JENKINS_SETUP.md)
- [Playwright execution](docs/PLAYWRIGHT_EXECUTION.md)

Do not create a paid plan, add a payment card, or point staging at a database that contains real patients without an explicit decision to do so.
