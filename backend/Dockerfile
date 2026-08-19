FROM ubuntu:24.04

LABEL org.opencontainers.image.source="https://github.com/ethos-adamas/tacitus"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3t64 \
    && rm -rf /var/lib/apt/lists/*

COPY --chmod=0555 target/release/tacitus-backend /usr/local/bin/tacitus-backend

EXPOSE 3000
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/tacitus-backend"]
