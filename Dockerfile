# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY --link package.json bun.lockb* ./

# Install dependencies
RUN  bun install --frozen-lockfile || bun install

# Copy application files
COPY --link session-webhook-server.ts .

# Create data directory for storage
RUN mkdir -p /app/data

# Expose port
EXPOSE 8080

# Run the application
CMD ["bun", "run", "start"]
