# AcquisitionOS — Realtime Service Dockerfile
# Bun + Socket.IO WebSocket server with Redis pub/sub support
# Port: 3003

FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy application source
COPY index.ts ./

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3003

CMD ["bun", "run", "index.ts"]
