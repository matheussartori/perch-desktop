# Perch signaling server — a tiny WebSocket rendezvous. Deploy anywhere that
# gives it a PORT and terminates TLS in front (Fly, Render, Railway, or a VPS
# behind Caddy/nginx). It brokers WebRTC handshakes only; media stays peer-to-peer.
FROM node:22-alpine
WORKDIR /app

# Install deps first for layer caching. tsx is a runtime dep here (we run TS
# directly), so --omit=dev keeps it while dropping nothing we need.
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# Platforms inject their own PORT; this is just the local/default fallback.
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
