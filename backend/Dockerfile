FROM ubuntu:24.04

LABEL org.opencontainers.image.source="https://github.com/ethos-adamas/tacitus"

COPY --chmod=0555 artifacts/tacitus-backend /usr/local/bin/tacitus-backend

EXPOSE 3000
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/tacitus-backend"]
