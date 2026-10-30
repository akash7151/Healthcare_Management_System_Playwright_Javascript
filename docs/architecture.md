# Architecture

The clinic app uses the existing MySQL database `healthcare_db`. Checkpoint 1 schema remains. A later migration adds checked-in and in-progress appointment statuses, doctor qualification and active flag, encounter examination and treatment notes, audit outcome, password reset tokens, and inventory movements. Existing rows are kept.

## Layout

- `frontend/` — React status page. Later feature folders will live under `frontend/src`.
- `backend/src` — Express app, environment parsing, Prisma client, and error handling.
- `backend/prisma` — schema, migrations, fictional seed, and a data-integrity check.
- `docs/` — this note and the requirement summary.
- Playwright files at the repository root stay in place until real end-to-end tests replace the example.

## Data rules encoded in the schema

- Users belong to one role. Roles and permissions are many-to-many.
- Sessions store a token hash, not the raw token. No sessions are created by the seed.
- Patients have a unique `patientCode`. A portal login is optional.
- Doctors have a unique license number and weekday schedule windows stored as `HH:mm` text.
- Appointments reference one patient and one doctor. Overlap prevention for confirmed visits is an application rule. MySQL has no exclusion constraint, so later booking code must lock the doctor’s rows and reject overlaps inside a transaction. The seed check already rejects overlapping `SCHEDULED` and `CONFIRMED` rows.
- An encounter may attach to one appointment. Vitals and diagnoses belong to that encounter.
- Prescriptions require a patient and a doctor. Line quantities are unsigned.
- Inventory batches are unique per medication and batch number. Quantity is unsigned.
- Invoice money uses `DECIMAL(12,2)`. `total = subtotal - discount + tax`. `balance = total - payments + refunds`. Payment references are unique.
- Audit rows store actor, action, entity type, and entity id. They do not store passwords, tokens, or clinical note text.

## Roles

`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PATIENT`, and `BILLING_STAFF`. Permission codes are seeded. The API does not enforce them until the authentication checkpoint.

## Failure handling

`/api/status` returns an error response when MySQL cannot be queried. The handler logs a short message and does not return the connection string.

## Run locally

From `backend`, with `DATABASE_URL` in `.env`:

```
npx prisma migrate deploy
npx prisma generate
npm run dev
```

From `frontend`:

```
npm run dev
```

The UI is http://localhost:5173 and the API is http://localhost:4000. Seed accounts use `@example.test` addresses and the password `DemoPass123!`. Automated API tests use a separate database, `healthcare_db_test`, and do not reset `healthcare_db`.
