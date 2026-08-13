FROM busybox:1.38-musl
RUN addgroup -S webgroup && adduser -S webuser -G webgroup
COPY --chown=webuser:webgroup site/. /www/

USER webuser

EXPOSE 8080
CMD ["busybox", "httpd", "-f", "-p", "8080", "-h", "/www"]