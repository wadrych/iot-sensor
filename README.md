# IoT Sensor – weather measurement series

Web application that collects weather measurements (temperature, humidity, pressure, wind) from IoT sensors and presents them grouped in series. Sensors push results to a REST API with a per-sensor API key; anonymous readers browse the data; an administrator manages series and sensors.

## Status

Work in progress.

## Tech stack

| Area         | Choice                                             |
| ------------ | -------------------------------------------------- |
| Runtime      | Node.js 24, npm workspaces, TypeScript 6.0         |
| Backend      | Fastify 5, Zod 4                                   |
| Database     | PostgreSQL 18                                      |
| Tests        | Vitest                                             |
| Tooling      | ESLint 9, Prettier, husky, commitlint, lint-staged |
| CI / hosting | GitHub Actions, Render                             |

## Repository layout

```
apps/server/       Fastify API (src/, test/)
apps/web/          React SPA (planned)
tools/generator/   sensor emulator CLI (src/, test/)
packages/shared/   shared Zod schemas and types
docs/              database schema (ERD)
```

## Local setup

Requirements: Node.js 24 (see `.nvmrc`), npm 11, Docker with Docker Compose.

```sh
npm ci                       # install dependencies and git hooks
cp .env.example .env         # local configuration
docker compose up -d         # start PostgreSQL on 127.0.0.1:5432
npm run db:migrate -w apps/server   # create the database tables
npm run db:seed -w apps/server      # create the admin account (first run only)
npm run dev -w apps/server   # start the API with auto-reload
```

Then open http://localhost:3000/api/health – it should return `{"status":"ok"}`.

### Environment variables

| Variable         | Required  | Default     | Description                                                     |
| ---------------- | --------- | ----------- | --------------------------------------------------------------- |
| `DATABASE_URL`   | yes       | –           | PostgreSQL connection string (`postgres://` or `postgresql://`) |
| `HOST`           | no        | `127.0.0.1` | Interface the server binds to (`0.0.0.0` on Render)             |
| `PORT`           | no        | `3000`      | HTTP port (set automatically by Render)                         |
| `ADMIN_USERNAME` | seed only | –           | Username of the admin created by `db:seed`                      |
| `ADMIN_PASSWORD` | seed only | –           | Initial admin password (min. 8 characters)                      |
| `TRUST_PROXY`    | no        | –           | Reverse-proxy addresses headers are trusted                     |

The server validates these at startup and exits with an error if any is invalid. `db:seed` creates the admin only when the `users` table is empty, so it never overwrites a changed password.

## Scripts

Run from the repository root:

| Command                                   | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `npm run dev -w apps/server`              | Run the API from TypeScript sources with auto-reload          |
| `npm run build`                           | Compile all packages (`tsc -b`)                               |
| `npm start -w apps/server`                | Run the compiled API from `apps/server/dist`                  |
| `npm test`                                | Run tests (Vitest; Docker must be running for database tests) |
| `npm run db:generate -w apps/server`      | Generate a SQL migration from `src/db/schema.ts`              |
| `npm run db:migrate -w apps/server`       | Apply pending migrations to `DATABASE_URL`                    |
| `npm run db:seed -w apps/server`          | Create the admin account if no user exists                    |
| `npm run lint`                            | Lint with ESLint                                              |
| `npm run typecheck`                       | Type-check all projects                                       |
| `npm run format` / `npm run format:check` | Format / check formatting with Prettier                       |
| `npm start -s -w tools/generator -- …`    | Run the sensor data generator                                 |

## Deployment

Render deploys automatically from the `deploy` branch using the Blueprint in [`render.yaml`](render.yaml). To release, after CI passes on `main`:

```sh
git push origin main:deploy
```

## Data generator

`tools/generator` emulates a sensor. It sends results to `POST /api/measurements` with the sensor's API key in the `X-API-Key` header and never connects to the database.

### Getting a sensor key

Register a sensor as the administrator. The key is returned only in this response.

```sh
API=http://localhost:3000
TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<password>"}' | jq -r .accessToken)
curl -s -X POST $API/api/sensors -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Balcony hygrometer","seriesId":1}' | jq -r .apiKey
```

### Usage

```sh
SENSOR_API_KEY=<key> npm start -s -w tools/generator -- --api <url> --mode <mode> --min <n> --max <n> \
  (--count <n> --step <duration> | --live --interval <duration>) [--period <duration>]
```

| Parameter                           | Required | Description                                                                                                                                              |
| ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--api <url>`                       | yes      | Base URL of the app                                                                                                                                      |
| `SENSOR_API_KEY` / `--key <key>`    | yes      | Sensor API key.                                                                                                                                          |
| `--mode <mode>`                     | yes      | `range`: random values in [min, max]; `random`: random walk within [min, max], each step at most 5 % of the range; `sine`: sine wave between min and max |
| `--min <n>`, `--max <n>`            | yes      | Value range, `min < max`. Negative numbers need `=`                                                                                                      |
| `--period <duration>`               | no       | Period of the sine wave                                                                                                                                  |
| `--count <n>` + `--step <duration>` | backfill | Send `n` (1–10000) results with past timestamps `step` apart, the last one now                                                                           |
| `--live` + `--interval <duration>`  | live     | Send a current result every `interval` until exit                                                                                                        |
| `-h`, `--help`                      | no       | Help                                                                                                                                                     |

Durations are an integer with a unit: `ms`, `s`, `m`, `h` or `d`.

### Examples

```sh
# Sample data: 24 hourly humidity results ending now
SENSOR_API_KEY=<key> npm start -s -w tools/generator -- \
  --api https://iot-sensor-twea.onrender.com --mode random --min 30 --max 90 --count 24 --step 1h

# Live: a temperature result every 30 s until kill
SENSOR_API_KEY=<key> npm start -s -w tools/generator -- \
  --api https://iot-sensor-twea.onrender.com --mode sine --min=-2 --max 12 --live --interval 30s
```

## License

[MIT](LICENSE)
