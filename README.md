# BiletFlow

Self-service event ticketing platform for Kazakhstan. CSCI 361 Software Engineering course project (Team 12).

BiletFlow covers event management, ticket reservations, simulated payments, QR ticket issuance, admission verification, refunds, promotional campaigns, analytics and customer support, on the web and on mobile.

## Repository layout

| Folder | What it is |
|---|---|
| `backend-python/` | FastAPI + PostgreSQL backend. 92 API operations across 81 paths, 23 database tables, 273 automated backend tests. |
| `web/` | React + TypeScript + Vite website for attendees, organizers and administrators (`/admin`). |
| `mobile/` | React Native + Expo app. Attendees, organizers and door staff use the same app with role-specific screens. |
| `docs/` | Setup guide, API reference, database schema, requirements, traceability matrix, acceptance reports. |

## Quick start (about 5 minutes)

Requirements: Docker Desktop (running), Node.js 20 or newer, Git.

### 1. Start the backend and database

From the repository root:

```bash
docker compose up -d --build
docker compose ps
```

On first start the backend applies the database migrations and loads demonstration data. If `docker compose ps` shows the backend as stopped (it can start before the database is ready), run `docker compose up -d` once more.

| Service | Address |
|---|---|
| Backend API | http://localhost:8000 |
| Swagger API documentation | http://localhost:8000/docs |
| PostgreSQL | localhost:5433 |

### 2. Run the website

```bash
cd web
npm ci
npm run dev -- --host 0.0.0.0 --port 3000 --strictPort
```

Open http://localhost:3000. The website talks to `http://localhost:8000` by default. To use another backend address, set `VITE_API_URL` first:

| Shell | Command |
|---|---|
| Windows CMD | `set VITE_API_URL=http://127.0.0.1:8000` |
| Windows PowerShell | `$env:VITE_API_URL = "http://127.0.0.1:8000"` |
| Linux / macOS | `export VITE_API_URL=http://127.0.0.1:8000` |

The website shares a translation file with the mobile app (`mobile/src/i18n/messages.ts`). It builds and runs without installing the mobile dependencies.

### 3. Run the mobile app (optional)

```bash
cd mobile
npm ci
```

Connect the phone and the computer to the same network and find the computer's IPv4 address (`ipconfig` on Windows). Set the API address, then start Expo:

| Shell | Command |
|---|---|
| Windows CMD | `set EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000` |
| Windows PowerShell | `$env:EXPO_PUBLIC_API_URL = "http://YOUR_LOCAL_IP:8000"` |
| Linux / macOS | `export EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000` |

```bash
npx expo start --go --lan
```

Scan the QR code with Expo Go. If Expo Go cannot run the project's native dependencies, use a development build (see `mobile/README.md`). For an Android emulator use `http://10.0.2.2:8000` as the API address.

Keep the backend, website and Expo server running in separate terminals.

## Demo accounts

The password for every account is `demo1234`.

| Email | Role |
|---|---|
| `dana@example.com` | Attendee |
| `aigerim@example.com` | Organizer |
| `nurlan@example.com` | Door staff |
| `admin@example.com` | Administrator |

Suggested first check: sign in as Dana, open the "Tech Meetup" event and buy a ticket (promo code `MEETUP10` gives 10% off). Then sign in as Aigerim to see the sale on the organizer dashboard. Events with assigned seating (for example "Jazz Night") cannot be bought on the website; the seat picker is not built yet.

## Updating an existing installation

```bash
git pull origin main
docker compose up -d --build
```

Run `npm ci` again in `web` or `mobile` if their dependencies changed. The backend applies new migrations on start and keeps existing data. Do not delete database volumes to fix migration problems. For a clean demo reset only, `docker compose down -v` removes all data and reloads the demonstration data on the next start.

More setup and troubleshooting help: `docs/SETUP.md` and `docs/FINAL_SYSTEM_ACCEPTANCE_REPORT.md`.

## Testing and verification

| Test suite | Passed |
|---|---:|
| Backend pytest suite (24 test files) | 273 |
| Mobile automated tests, including live integration | 70 |
| Browser regression tests | 77 |
| Live Chrome integration test | 1 |
| **Total** | **421** |

The comprehensive baseline is commit `c5557cf` (merged into `c90dd3c` with identical contents). Later commits changed only mobile styling (`849587d`), the README, and one website build-config file; after `849587d`, TypeScript, Expo lint and 68 mobile tests passed again (the two live integration tests need an isolated backend and were skipped).

Also covered: reservation and checkout concurrency on PostgreSQL, server-side price and discount validation, idempotent checkout and support requests, protected QR and PDF downloads, cross-account authorization, duplicate admission prevention.

### Backend tests

The backend tests run against a real PostgreSQL database, so use a separate test database, never one with data you care about.

```bash
cd backend-python
pip install -r requirements-dev.txt
python -m pytest
```

See `docs/SETUP.md` for creating the test database (schema from `docs/schema.sql`, then `python migrate.py`).

### Mobile tests

```bash
cd mobile
npx tsc --noEmit
npx expo lint
node --test tests/*.test.cjs
```

Live mobile integration tests need a separately configured test backend.

### Website checks

```bash
cd web
npm run build
npm run lint
```

## Known limitations

- Assigned-seating events cannot be bought on the website (seat picker not built).
- Payments are simulated; there is no real payment provider.
- Requirements status is tracked in `docs/REQUIREMENTS_TRACEABILITY.csv`; some items are still marked partial or out of scope there.
