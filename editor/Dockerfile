FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3
RUN curl -fsSL https://github.com/pocketbase/pocketbase/releases/download/v0.28.4/pocketbase_0.28.4_linux_amd64.zip -o /tmp/pb.zip \
 && echo '44161d9e8838d3226fee7f2a857b8033f642ace1f3486a1125b99fd6b8b08532  /tmp/pb.zip' | sha256sum -c - \
 && python3 -c "import zipfile; zipfile.ZipFile('/tmp/pb.zip').extract('pocketbase','/app')" \
 && chmod +x /app/pocketbase
FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/pb_hooks ./pb_hooks
COPY --from=build /app/pb_migrations ./pb_migrations
COPY --from=build /app/scripts/start.sh ./start.sh
COPY --from=build /app/pocketbase ./pocketbase
RUN mkdir -p /data/pb_data /data/state && chown -R node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8091 EDITOR_STATE_DIR=/data/state
EXPOSE 8091
CMD ["sh", "./start.sh"]
