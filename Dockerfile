FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.22-alpine AS backend
WORKDIR /app
COPY backend/ ./
RUN go build -o server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=backend /app/server ./
COPY --from=frontend /app/frontend/dist ./frontend/dist
COPY backend/scripts/ ./scripts/
ENV FRONTEND_DIST=./frontend/dist
ENV SCRIPT_PATH=./scripts/default.md
EXPOSE 8080
CMD ["./server"]
