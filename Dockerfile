# Huddle needs a long-lived process (WebSockets + SQLite + a disk), so it ships as
# a container rather than as serverless functions. Any host that runs a container
# with a persistent volume works: Fly.io, Railway, Render, a VPS, a Raspberry Pi.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runtime deps only — the server itself is run straight from TypeScript by Node's
# built-in type stripping, so there is nothing to compile here.
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HUDDLE_DATA_DIR=/data

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.ts tsconfig.json ./
COPY server ./server
COPY src ./src

# Chat history and uploads live here — mount a volume or they vanish on redeploy.
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
USER node

EXPOSE 4000
CMD ["node", "server/index.ts"]
