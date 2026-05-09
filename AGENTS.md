# Theatrico Agent Notes

This file tracks implementation conventions and architecture decisions for coding agents working on Theatrico.

## Product Shape

Theatrico is a theater companion app. An operator starts a live session, audience members join by QR code or join code, and the audience PWA follows the current script position. Future work will add microphone capture, Whisper API transcription, script matching, and websocket position broadcasts.

## Architecture

- `backend/` is a Go HTTP server.
- `backend/cmd/server/main.go` wires REST endpoints, websocket sessions, and static frontend serving.
- `backend/internal/script/` parses Markdown scripts into acts, scenes, and attributed lines.
- `backend/internal/session/` owns in-memory session creation and join-code lookup.
- `backend/internal/ws/` owns websocket client registration and broadcast plumbing.
- `frontend/` is a Vite React TypeScript PWA.
- `frontend/src/lib/api.ts` is the frontend API boundary.
- `frontend/src/hooks/useSessions.ts` owns React Query hooks for script/session reads and session creation.
- `frontend/src/components/ui/` contains shadcn-style primitives. Prefer adding shadcn components here before creating bespoke controls.

## Frontend Rules

- Use React Query for server reads and writes. Fetching scripts, fetching sessions, validating join codes, and creating sessions should go through query/mutation helpers rather than direct `fetch` calls in page components.
- Prefer shadcn-style components from `frontend/src/components/ui/` for buttons, inputs, badges, cards, and future dialogs/forms.
- Use Tailwind CSS utilities for styling. Avoid inline styles unless a value is truly dynamic, such as deterministic character colors in the script renderer.
- Keep reusable rendering logic in components. Pages should mostly compose data hooks, navigation, and components.
- Keep websocket state separate from HTTP state. Websocket position updates live in `useWebSocket`; HTTP data lives in React Query.

## Backend Rules

- Keep REST response shapes explicit with JSON tags.
- Add new routes in `cmd/server/main.go` until the server grows enough to justify route packages.
- Preserve `GET /api/script` as the default parsed script endpoint for frontend previews and non-session reads.
- Preserve `POST /api/sessions` for operator session creation and `GET /api/sessions/{code}` for audience join/session hydration.

## Local Development

- Backend: `cd backend && go run ./cmd/server`
- Frontend dev server: `cd frontend && npm install && npm run dev`
- Production frontend build: `cd frontend && npm run build`
- After building the frontend, the Go server serves `frontend/dist` on the same port as the API.
