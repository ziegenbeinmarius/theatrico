# Theatrico

Theatrico is a theater PWA for following a live script. The current sprint provides the project skeleton: a Go backend that parses Markdown scripts, creates audience sessions, and serves a React PWA that renders the script and listens for live position updates.

## Structure

- `backend/` - Go API server, script parser, sessions, and websocket hub.
- `frontend/` - Vite React TypeScript PWA using React Query, Tailwind CSS, and shadcn-style UI primitives.
- `AGENTS.md` - architecture and implementation notes for future agents.

## Backend

```sh
cd backend
go run ./cmd/server
```

The server listens on `http://localhost:8080` by default.

Useful environment variables:

- `PORT` - HTTP port, defaults to `8080`.
- `HOST` - public host used for QR join URLs, defaults to `localhost:{PORT}`.
- `SCRIPT_PATH` - Markdown script path, defaults to `scripts/default.md`.
- `FRONTEND_DIST` - static frontend build directory, defaults to `../frontend/dist`.

## Frontend

```sh
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and websocket requests to the Go backend.

Build the installable PWA:

```sh
cd frontend
npm run build
```

After the frontend is built, `cd backend && go run ./cmd/server` serves the PWA and API from one port.

## API

- `GET /api/script` - returns the parsed default script.
- `POST /api/sessions` - creates a new live session and join URL.
- `GET /api/sessions/{code}` - returns session metadata and script.
- `GET /api/sessions/{code}/ws` - websocket endpoint for live position updates.
