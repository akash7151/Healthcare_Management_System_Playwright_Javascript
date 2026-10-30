# Requirements

This file records the rules the schema and later modules must follow. Checkpoint 1 stores the data. It does not yet enforce login or workflow screens.

| ID | Rule |
| --- | --- |
| FR-01 | Protected pages and APIs require an authenticated user. |
| FR-02 | A user can reach only the functions allowed by role and permission. |
| FR-03 | Each patient has a unique patient code. |
| FR-04 | A doctor cannot have two confirmed appointments that overlap. |
| FR-05 | Clinical records are readable and writable only by authorized roles. |
| FR-06 | A prescription belongs to a clinician and a patient. |
| FR-07 | Invoice totals and balances stay consistent with lines, payments, and refunds. |
| FR-08 | Security events and important record changes are written to the audit log. |
| FR-09 | Database failures return a safe error and do not expose credentials. |
| FR-10 | Critical workflows need repeatable tests. Those tests are a later checkpoint. |

Seed data and tests must use fictional people. This demo is not a production healthcare record system and is not a DPDP compliance review.
