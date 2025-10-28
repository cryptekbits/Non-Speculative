# syntax=docker/dockerfile:1
FROM node:20-slim AS base

WORKDIR /usr/src/app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source and build with a builder stage to keep dev deps out
FROM node:20-slim AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Final image
FROM node:20-slim
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Copy runtime deps and build artifacts
COPY --from=base /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/build ./build
COPY package.json ./package.json

EXPOSE 8080
CMD ["node", "build/index.js", "--http", "--port", "8080", "--docs-path", "/data/project"]
