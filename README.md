
# BiletFlow

Self-service event ticketing platform for Kazakhstan. CSCI 361 Software Engineering course project.

BiletFlow integrates event management, ticket reservations, simulated payments, QR ticket issuance, admission verification, refunds, promotional campaigns, analytics and customer support across web and mobile applications.

## What is in this repo

| Folder | What it is |
|---|---|
| `backend-python/` | FastAPI + PostgreSQL backend. 92 API operations across 81 paths, 23 database tables and 273 automated backend tests. |
| `web/` | React + TypeScript + Vite website for attendees, organizers and platform administrators (`/admin`). |
| `mobile/` | React Native + Expo mobile application. Attendees, organizers and door staff use the same app with role-specific interfaces. |
| `docs/` | Setup guides, API reference, database schema, requirements, traceability matrix, acceptance reports and demonstration instructions. |

## Run the project

### 1. Backend and database

After cloning the repository, start Docker Desktop, then run from the repository root:

```bash
docker compose up -d --build
docker compose ps
```

The backend automatically applies versioned database migrations before starting.

The local database is initialized with demonstration data on first setup.

Available services:

| Service | Address |
|---|---|
| Backend API | http://localhost:8000 |
| Swagger API documentation | http://localhost:8000/docs |
| OpenAPI specification | http://localhost:8000/openapi.json |
| PostgreSQL | localhost:5433 |


### 2. Install frontend dependencies

From the repository root:

```bash
cd mobile
npm ci

cd ../web
npm ci

cd ..
```

**Important:** Install dependencies in both directories, even when running only the website. The current web and mobile implementations share a translation catalogue located in `mobile/src/i18n/messages.ts`.


### 3. Run the website

Open a separate terminal:

```bash
cd web
```

Windows PowerShell:

```powershell
$env:VITE_API_URL = "http://127.0.0.1:8000"
npm run dev -- --host 0.0.0.0 --port 3000 --strictPort
```

Linux/macOS:

```bash
export VITE_API_URL=http://127.0.0.1:8000
npm run dev -- --host 0.0.0.0 --port 3000 --strictPort
```

Open http://localhost:3000.

### 4. Run the mobile application

Open another terminal:

```bash
cd mobile
```

Connect your phone and computer to the same local network.

Find your computer's local IPv4 address using `ipconfig` on Windows.

Windows PowerShell:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://YOUR_LOCAL_IP:8000"
npx expo start --go --lan
```

Linux/macOS:

```bash
export EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000
npx expo start --go --lan
```

Replace `YOUR_LOCAL_IP` with your computer's actual local IPv4 address.

Scan the Expo QR code using a compatible Expo Go installation. If Expo Go is incompatible with the project's native dependencies, use a development build as described in `mobile/README.md`.

For an Android emulator, use `http://10.0.2.2:8000` as the API URL.

The backend, website and mobile development server should remain running in separate terminals.

## Updating an existing installation

```bash
git pull origin main
docker compose up -d --build
```

If package dependencies have changed, reinstall them using `npm ci` in the relevant directories.

The backend applies versioned schema upgrades while preserving existing database records.

**Do not delete database volumes to resolve missing columns or migration issues.**

See `docs/SETUP.md` and `docs/FINAL_SYSTEM_ACCEPTANCE_REPORT.md` for additional setup and troubleshooting information.

## Testing and verification

The comprehensive regression baseline is commit `c5557cf`, merged into `c90dd3c` with identical tracked contents.

| Test suite | Passed |
|---|---:|
| Backend pytest suite (24 test files) | 273 |
| Mobile automated tests, including live integration | 70 |
| Browser regression tests | 77 |
| Live Chrome integration test | 1 |
| **Total** | **421** |

The final successful runs reported zero failures.

Commit `849587d` adds a mobile discovery header change. TypeScript, Expo lint and 68 mobile regression tests passed again on this version. The two live integration tests were skipped during this rerun because they require an isolated live backend.

Additional verification includes:

- PostgreSQL transaction and reservation concurrency tests.
- Server-side price and promotional discount validation.
- Idempotent checkout and support request retries.
- Protected QR and PDF downloads.
- Cross-account authorization tests.
- Duplicate admission prevention.
- Web production build and frontend lint checks.
- Expo Doctor: 20/20 checks passed on the comprehensive baseline.

### Backend tests

```bash
cd backend-python
pip install -r requirements-dev.txt
python -m pytest
```

Configure an isolated PostgreSQL test database before running the backend suite, following the project setup documentation.

Do not execute integration tests against a database containing important demonstration or user records.

### Mobile tests

```bash
cd mobile
npx tsc --noEmit
npx expo lint
node --test tests/*.test.cjs
```

Live mobile integration tests require a separately configured test backend.

### Website checks

```bash
cd web
npm run build
npm run lint
```

