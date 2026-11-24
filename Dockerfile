# syntax=docker/dockerfile:1

# The web app is built here so the container can serve it from the same origin
# as the API: https://<host>/ooo/ -> container :8080.
FROM --platform=$BUILDPLATFORM node:26-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM node:26-alpine AS server-build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=server-build --chown=app:app /app/package.json ./package.json
COPY --from=server-build --chown=app:app /app/node_modules ./node_modules
COPY --from=server-build --chown=app:app /app/dist ./dist
COPY --from=web-build --chown=app:app /web/dist ./public
# Optional Office add-in wrapper. Served through the manifest route, which
# rewrites the development URLs to PUBLIC_BASE_URL.
COPY --chown=app:app office/manifest.xml ./manifest-template.xml

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
