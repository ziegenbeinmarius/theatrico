FROM node:20-alpine AS frontend
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM golang:1.22-alpine AS backend
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
