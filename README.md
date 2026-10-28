# BiletFlow

Self-service event ticketing platform for Kazakhstan. CSCI 361 course project.

## What is in this repo

| Folder | What it is |
|---|---|
| `backend-python/` | The API (FastAPI + PostgreSQL). 86 endpoints, 104 automated tests. |
| `mobile/` | React Native (Expo) app: attendee screens and organizer dashboard. |
| `docs/` | Setup guide, API reference, database schema, demo data, tasks, the SRS. |

## Run it (about 5 minutes)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and this repo cloned.

```bash
docker compose up -d --build
```

Then open http://localhost:8000/docs to see and try every endpoint. The database comes preloaded with demo events, tickets and promo codes.

To wipe the database and reload the demo data: `reset-demo.bat` (Windows) or `./reset-demo.sh` (Mac/Linux).

## Where to read next

- `docs/SETUP.md`: full setup guide, what works and what does not, demo IDs and promo codes
- `docs/DATA_MODELS_AND_APIS.md`: every table and every endpoint
- `docs/TASKS.md`: who is doing what, and what is left
- `mobile/README.md`: how to run the mobile app
- `docs/BiletFlow_SRS_Initial_Draft.pdf`: the requirements document

## Run the tests

```bash
cd backend-python
pip install -r requirements-dev.txt
python -m pytest
```
The tests need the database running (see above).
