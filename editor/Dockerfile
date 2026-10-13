FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/index.mjs server/contact.mjs ./server/
COPY scripts/start.sh ./start.sh
USER node
ENV HOST=0.0.0.0 PORT=8091
EXPOSE 8091
CMD ["sh", "./start.sh"]
