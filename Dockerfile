# Optional: for running Huddle on an always-on machine on your own network — a home
# server, a NAS, a Raspberry Pi — instead of a laptop. Mount a volume at /data or
# the chat history and uploads disappear with the container.
#
#   docker build -t huddle .
#   docker run -p 4000:4000 -v huddle-data:/data huddle

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
