<<<<<<< HEAD
# Healthcare Management

Local clinic demo. Checkpoint 1 is the project skeleton, MySQL schema, migration, and fictional seed data. Login, scheduling workflows, clinical editing, billing actions, and automated test suites are later checkpoints.

The workspace folder is still named `psb-digital-banking-demo`. Existing Playwright example tests are unchanged.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS (`http://localhost:5173`)
- Backend: Node.js, Express, TypeScript (`http://localhost:4000`)
- Database: MySQL 8, database `healthcare_db`
- ORM: Prisma (`provider = "mysql"`)

## Database

MySQL must already be running on `localhost:3306`. This project uses a database named `healthcare_db`. It does not modify `orangehrm`, `sakila`, `world`, or the system `mysql` schema.

Create the database once if it is missing:

```sql
CREATE DATABASE healthcare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. Do not commit `.env`.

Local development on this machine uses the MySQL `root` account because that is the account supplied for setup. Use a dedicated database user before any shared or production deployment.

## Commands

From the repository root, after `backend/.env` exists:

```bash
npm install --prefix backend
npm install --prefix frontend
npm run db:validate
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev:backend
npm run dev:frontend
```

`db:migrate` applies the committed migration with `prisma migrate deploy`. It does not reset existing data.

## Fictional sign-in data

Authentication is not implemented yet. Seed users share one local password so the next checkpoint can log them in:

`DemoPass123!`

| Email | Role |
| --- | --- |
| asha.menon@example.test | Admin |
| meera.iyer@example.test | Doctor, general medicine |
| rohan.kapoor@example.test | Doctor, pediatrics |
| lata.kulkarni@example.test | Receptionist |
| vikram.desai@example.test | Billing staff |
| ravi.nair@example.test | Patient `P-10001` |
| nina.dsouza@example.test | Patient `P-10002` |

`P-10003` (Omar Sheikh) is a walk-in patient with no portal user. All of these people are fictional.

## API

- `GET /api/health` returns `{ "status": "ok" }`
- `GET /api/status` returns database connectivity and record counts only

The home page reads `/api/status`.
=======
# Healthcare_Management_System_Playwright_Javascript
A complete healthcare application with frontend, backend, database configuration, and Playwright automation tests.
>>>>>>> a3e6ec1c5d3013ee2bd2ba65f832a69ca05e4677
