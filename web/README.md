# BiletFlow web

Shared React + TypeScript + Vite frontend for attendees and organizers.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The FastAPI service must run at
http://localhost:8000; set `VITE_API_URL` in `.env.local` to use another address.
See [SETUP.md](../docs/SETUP.md) for Docker and demo data.

Public pages: `/`, `/events/:id`, `/login`.
Organizer entry: `/organizer` (demo account `aigerim@example.com`, `demo1234`).

```sh
npm run build
npm run lint
```

For the implemented organizer module, browser tests, API integration walkthrough
and remaining work, see [ORGANIZER_MANAGEMENT.md](../docs/ORGANIZER_MANAGEMENT.md).
