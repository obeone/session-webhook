# syntax=docker/dockerfile:1

FROM oven/bun:1.1.14-alpine AS base

# Set working directory
WORKDIR /app

# Create non-root user for secure runtime
RUN addgroup -g 564 -S app && adduser -u 564 -S app -G app && \
    chown -R app:app /app

USER app

# Copy only manifest files first for better cache usage
COPY --link --chown=564:564 package.json bun.lockb* ./

# Install dependencies using BuildKit cache
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile || bun install

# Copy application source code
COPY --link --chown=564:564 session-webhook-server.ts .

EXPOSE 8080

# Start the app
CMD ["bun", "run", "start"]
