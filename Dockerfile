# Build from the workspace directory: docker build -f secret-chat-be/Dockerfile .
FROM node:24-alpine AS frontend
WORKDIR /app/secret-chat-fe
COPY secret-chat-fe/package*.json ./
RUN sed -i 's#http://nexus.insiel.it/repository/npm-public/#https://registry.npmjs.org/#g' package-lock.json \
    && npm ci --registry=https://registry.npmjs.org
COPY secret-chat-fe/ ./
RUN npm run build

FROM rust:1.96-bookworm AS backend
RUN apt-get update && apt-get install -y --no-install-recommends clang libssl-dev pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /app/secret-chat-be
COPY secret-chat-be/ ./
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=backend /app/secret-chat-be/target/release/secret-chat-be /usr/local/bin/secret-chat
COPY --from=frontend /app/secret-chat-fe/dist /app/dist
ENV STATIC_DIR=/app/dist
EXPOSE 3000
USER 65532:65532
CMD ["secret-chat"]
