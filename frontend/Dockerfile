FROM nginx:1.29-alpine

LABEL org.opencontainers.image.source="https://github.com/ethos-adamas/tacitus"

COPY nginx.conf /etc/nginx/nginx.conf
COPY dist/ /usr/share/nginx/html/

EXPOSE 8080
USER 101:101
ENTRYPOINT ["nginx", "-g", "daemon off;"]
