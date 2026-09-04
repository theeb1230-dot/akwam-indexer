FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime-base

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

RUN groupadd --system theeb \
  && useradd --system --gid theeb --home-dir /app theeb

COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=theeb:theeb package.json package-lock.json ./
COPY --chown=theeb:theeb src ./src

FROM runtime-base AS worker

USER root
RUN apt-get update \
  && apt-get install --yes --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*
COPY --chown=theeb:theeb scripts ./scripts
COPY --chown=theeb:theeb migrations ./migrations
ENV CHROME_PATH=/usr/bin/chromium
ENV THEEB_ROLE=health-worker
USER theeb
STOPSIGNAL SIGTERM
CMD ["node", "src/entrypoint.js"]

FROM runtime-base AS migration

COPY --chown=theeb:theeb scripts ./scripts
COPY --chown=theeb:theeb migrations ./migrations
USER theeb
CMD ["node", "scripts/migrate-postgres.js"]

FROM runtime-base AS api

ENV THEEB_ROLE=api
USER theeb
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "src/entrypoint.js"]
