FROM busybox:1.38-musl
RUN addgroup -S webgroup && adduser -S webuser -G webgroup
COPY --chown=webuser:webgroup site/. /www/

USER webuser

EXPOSE 8080
CMD ["busybox", "httpd", "-f", "-p", "8080", "-h", "/www"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD busybox wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1
