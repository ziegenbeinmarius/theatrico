# Theatrico

Real-time theater script prompter. An operator mic captures audio, a Go backend transcribes it via the Whisper API, and pushes the current script position to audience phones showing a Next.js PWA.

## Structure

```
theatrico/
├── api/    — Go 1.24 API server (Chi router, PostgreSQL, golang-migrate)
├── web/    — Next.js 14 frontend (App Router, Tailwind CSS, shadcn/ui)
└── AGENTS.md — Architecture and implementation notes
```

## Quick Start (Docker Compose)

```bash
docker compose up
```

This starts three services:

| Service | URL | Description |
|---------|-----|-------------|
| `api` | http://localhost:8080 | Go REST API |
| `web` | http://localhost:3000 | Next.js frontend |
| `db` | localhost:5432 | PostgreSQL 16 |

## Local Development (without Docker)

### Prerequisites

- Go 1.24+
- Node.js 20+
- PostgreSQL 16 running locally

### API

```bash
cd api
cp .env.example .env  # create and edit as needed
go run ./cmd/api
```

The server listens on `http://localhost:8080` by default.

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | — | PostgreSQL connection string |

### Database Migrations

```bash
cd api
DATABASE_URL=postgres://theatrico:theatrico@localhost:5432/theatrico?sslmode=disable \
  go run ./cmd/migrate up
```

### Web

```bash
cd web
npm install
npm run dev
```

The dev server listens on `http://localhost:3000`.

## API Endpoints

- `GET /api/health` — Health check, returns `{"status":"ok"}`

## Linting

**Go:**
```bash
cd api && golangci-lint run
```

**TypeScript / React:**
```bash
cd web && npm run lint
cd web && npm run format
```
