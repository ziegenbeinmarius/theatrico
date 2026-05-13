# Theatrico

Real-time theater script prompter. An operator mic captures audio, a Go backend transcribes it via the Whisper API, and pushes the current script position to audience phones showing a PWA.

## Structure

This is a pnpm workspaces monorepo:

- `backend/` — Go API server, script parser, session management, WebSocket hub, audio receiver, Whisper recognizer.
- `apps/web/` — Vite React TypeScript PWA using React Query, Tailwind CSS, and shadcn-style UI primitives.
- `apps/native/` — Placeholder for theatrico-native React Native app.
- `packages/shared/` — Placeholder for shared TypeScript code between web and native.
- `AGENTS.md` — architecture and implementation notes for future agents.

## Backend

```sh
cd backend
export OPENAI_API_KEY=sk-...
go run ./cmd/server
```

The server listens on `http://localhost:8080` by default.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required for audio)* | OpenAI API key for Whisper speech-to-text |
| `PORT` | `8080` | HTTP port |
| `HOST` | `localhost:{PORT}` | Public host used in QR join URLs |
| `SCRIPT_PATH` | `scripts/default.md` | Markdown script path |
| `FRONTEND_DIST` | `../apps/web/dist` | Static frontend build directory |

You can also place a `.env` file in `backend/` or the project root.

## Frontend (Web)

```sh
cd apps/web
npm install
npm run dev
```

Or from the repo root using pnpm workspaces:

```sh
pnpm install
pnpm dev
```

The Vite dev server proxies `/api` and websocket requests to the Go backend.

Build the installable PWA:

```sh
cd apps/web
npm run build
# or from root:
pnpm build
```

After building, `cd backend && go run ./cmd/server` serves the PWA and API on one port.

## API

- `GET /api/script` — full parsed script as JSON
- `POST /api/sessions` — create a new session; returns `{join_code, qr_url}`
- `GET /api/sessions/{code}` — session metadata and script
- `WS /api/sessions/{code}/ws` — audience websocket; receives `position_update` frames
- `WS /api/sessions/{code}/audio` — operator audio websocket; send binary chunks, receive `{"type":"transcript","text":"..."}`
- `POST /api/sessions/{code}/simulate` — inject transcript text without audio (for testing)

### Testing without a microphone

```bash
curl -X POST http://localhost:8080/api/sessions/ABC123/simulate \
  -H 'Content-Type: application/json' \
  -d '{"text":"What light through yonder window breaks"}'
```
