FROM node:20-alpine AS frontend
WORKDIR /app
RUN corepack enable
RUN corepack prepare pnpm@9.15.9 --activate

# Install workspace dependencies so web build tools and local packages resolve correctly.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/ ./apps/web/
COPY apps/native/package.json ./apps/native/package.json
COPY packages/shared/ ./packages/shared/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/web build

FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY backend/ ./
RUN go build -o server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=backend /app/server ./
COPY --from=frontend /app/apps/web/dist ./apps/web/dist
COPY backend/scripts/ ./scripts/
ENV FRONTEND_DIST=./apps/web/dist
ENV SCRIPT_PATH=./scripts/default.md
EXPOSE 8080
CMD ["./server"]
