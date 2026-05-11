# Repository Agent Instructions

## Branch And Review Policy

All code, documentation, configuration, or repository changes in this repository must be made on a dedicated branch or worktree, not directly on the default branch.

When a change is ready, submit the branch for review with a pull request or equivalent review handoff. Leave it unmerged until it has been reviewed by the workspace owner or another agent.

# Theatrico Agent Notes

This file tracks implementation conventions and architecture decisions for coding agents working on Theatrico.

## Product Shape

Theatrico is a theater companion app. An operator starts a live session, audience members join by QR code or join code, and the audience PWA follows the current script position. Future work will add microphone capture, Whisper API transcription, script matching, and websocket position broadcasts.

## Monorepo Structure (Sprint 1+)

```
theatrico/
├── api/                    # Go 1.24 backend (Chi router)
│   ├── cmd/
│   │   ├── api/main.go     # HTTP server entry point
│   │   └── migrate/main.go # Database migration runner
│   ├── internal/           # Private application packages
│   ├── migrations/         # golang-migrate SQL files (*.up.sql / *.down.sql)
│   ├── go.mod
│   ├── go.sum
│   ├── Dockerfile
│   └── .golangci.yml
├── web/                    # Next.js 14 frontend (App Router)
│   ├── app/                # Next.js App Router pages and layouts
│   ├── components/
│   │   └── ui/             # shadcn/ui primitives
│   ├── lib/
│   │   └── utils.ts        # cn() helper and shared utilities
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── components.json     # shadcn/ui config
│   ├── .eslintrc.json
│   ├── .prettierrc
│   └── Dockerfile
├── docker-compose.yml      # Local dev: api + web + db (PostgreSQL 16)
├── AGENTS.md               # This file
└── README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| API language | Go 1.24 |
| API router | Chi v5 |
| Database | PostgreSQL 16 |
| DB migrations | golang-migrate v4 |
| Frontend framework | Next.js 14 (App Router) |
| Frontend language | TypeScript 5 |
| Styling | Tailwind CSS v3 |
| UI components | shadcn/ui |
| Containerization | Docker + Docker Compose |
| Go linting | golangci-lint |
| JS linting | ESLint (eslint-config-next) |
| JS formatting | Prettier |

## Architecture Principles

1. **Clean Architecture** — Dependencies point inward. Domain has no external dependencies. Infrastructure implements domain interfaces.
2. **SOLID** — Single responsibility per class/module. Open for extension. Liskov substitution via interfaces. Interface segregation. Dependency inversion.
3. **Interface-Driven** — Every service, repository, and external integration has an interface. Implementations are injected.
4. **Separation of Concerns** — UI logic in components. Business logic in services. Data access in repositories.

## API Rules

- Keep REST response shapes explicit with JSON tags.
- Use `chi.NewRouter()` with `middleware.Logger`, `middleware.Recoverer`, `middleware.RequestID`.
- All routes are prefixed with `/api/`.
- Add new routes in `cmd/api/main.go` until the server grows enough to justify route packages.
- `GET /api/health` must always return `{"status":"ok"}` — used by Docker healthcheck.
- Use environment variable `DATABASE_URL` for PostgreSQL connection string.

## Web Rules

- Use Next.js App Router (`app/` directory) for all pages and layouts.
- Prefer shadcn/ui components from `components/ui/`. Add new primitives there before creating bespoke controls.
- Use Tailwind CSS utilities for styling. Avoid inline styles unless a value is truly dynamic.
- Use `@/` path alias for imports (configured in `tsconfig.json`).
- Server Components by default; add `"use client"` only when client interactivity is required.

## Database Migrations

Migration files live in `api/migrations/` and follow the naming convention:
`{sequence}_{description}.{up|down}.sql`

Run migrations:
```bash
cd api
DATABASE_URL=postgres://theatrico:theatrico@localhost:5432/theatrico?sslmode=disable \
  go run ./cmd/migrate up
```

## Local Development

Fastest path — start everything with Docker Compose:
```bash
docker compose up
```

Manual (without Docker):
- API: `cd api && go run ./cmd/api`
- Web dev server: `cd web && npm install && npm run dev`
- Database: Postgres 16 on `localhost:5432`, database `theatrico`, user `theatrico`, password `theatrico`

## Legacy Code

`backend/` and `frontend/` contain an earlier Vite React + gorilla/websocket implementation. New work targets `api/` and `web/` only. The legacy directories will be removed once the new stack is feature-complete.
