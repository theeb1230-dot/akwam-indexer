FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV THEEB_ROLE=api

WORKDIR /app

RUN groupadd --system theeb \
  && useradd --system --gid theeb --home-dir /app theeb

COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=theeb:theeb package.json package-lock.json ./
COPY --chown=theeb:theeb src ./src

USER theeb

EXPOSE 8080

CMD ["node", "src/entrypoint.js"]
