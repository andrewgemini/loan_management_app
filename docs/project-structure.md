# Loan Management App — Project Structure

```text
client/src/                 React 19 UI, dashboard, reporting and reusable controls
  components/               Layout, shadcn primitives and reporting controls
  pages/                    Dashboard, Admin, Loan Detail, Payment and Settings
  lib/                      Filter, export, drill-down and date-preset utilities
server/                     Express, tRPC procedures, domain services and tests
  routers/                  Loan, admin, export and notification contracts
  _core/                    Auth/session/server bootstrap infrastructure
drizzle/                    Drizzle schema, relations and ordered MySQL migrations
docs/                       User, admin and deployment documentation
```

## Deploy checklist

Install dependencies with `pnpm install`, configure platform-provided environment variables, run `pnpm build`, and start with `pnpm start`. Do not commit `.env` files. The managed platform injects database, OAuth and storage variables.

## Database schema and SQL import

The authoritative schema is `drizzle/schema.ts`. Apply the ordered SQL migrations only to a new or reviewed MySQL/TiDB database:

```bash
mysql --default-character-set=utf8mb4 -u <user> -p <database> < drizzle/0000_easy_rocket_racer.sql
mysql --default-character-set=utf8mb4 -u <user> -p <database> < drizzle/0001_chemical_wong.sql
mysql --default-character-set=utf8mb4 -u <user> -p <database> < drizzle/0002_grey_absorbing_man.sql
```

Review each migration and back up production data before applying it. For managed WebDev databases, use the project migration workflow rather than a manual shell import.
