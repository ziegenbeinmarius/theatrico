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

## Quick Start (Backend + Web)

From repo root:

```sh
pnpm install

# Terminal 1: backend
cd backend
export OPENAI_API_KEY=sk-...
go run ./cmd/server

# Terminal 2: web app
cd apps/web
pnpm dev
```

Open `http://localhost:5173` for web development.

## Native App (Expo)

Install dependencies once:

```sh
pnpm install
cd apps/native
```

### Run On Physical iOS Device (local native build)

```sh
cd apps/native
npx expo run:ios --device
```

Notes:

- Requires Xcode and an iOS signing setup on your Mac.
- If prompted, select your connected device from the list.
- This compiles and installs a dev build directly to the phone.

### Run On Physical Android Device (local native build)

```sh
cd apps/native
npx expo run:android --device
```

Notes:

- Requires Android SDK/ADB configured and USB debugging enabled.
- Verify device visibility with `adb devices`.

## EAS Build Workflows

The native project has EAS profiles in `apps/native/eas.json`:

- `development` uses `BACKEND_URL=http://localhost:8085` (simulator/dev local flow).
- `development-device` uses `BACKEND_URL=https://theatrico.fly.dev` (physical devices).
- `preview` and `production` also target `https://theatrico.fly.dev`.

### First-time setup

```sh
cd apps/native
eas login
eas build:configure
```

### Build dev client for physical devices (recommended)

```sh
cd apps/native
eas build --profile development-device --platform ios
eas build --profile development-device --platform android
```

Install the resulting builds from EAS links/QR on your devices, then start Metro for the dev client:

```sh
cd apps/native
npx expo start --dev-client
```

### Build preview/production binaries

```sh
cd apps/native
eas build --profile preview --platform ios
eas build --profile preview --platform android

eas build --profile production --platform ios
eas build --profile production --platform android
```

### Optional local override for backend URL

For local `expo run:*` commands, you can force the backend URL at build time:

```sh
cd apps/native
npx expo prebuild --platform ios --clean
BACKEND_URL=https://theatrico.fly.dev npx expo run:ios --device
BACKEND_URL=https://theatrico.fly.dev npx expo run:android --device
```

At runtime, backend URL can also be changed in the app Settings screen.

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
