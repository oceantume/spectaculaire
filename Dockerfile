FROM node:22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run precompress

# Plain alpine (not nginx:alpine) so nginx and nginx-mod-http-brotli come from the
# same apk repo and are guaranteed ABI-compatible — nginx:alpine ships a custom nginx
# build that doesn't match Alpine's own packaged nginx that the brotli module is built
# against, so the dynamic module fails to load against it.
FROM alpine:3.23
RUN apk add --no-cache nginx nginx-mod-http-brotli sqlite
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY nginx-analytics-format.conf /etc/nginx/http.d/00-analytics.conf
COPY scripts/aggregate-hits.sh /usr/local/bin/aggregate-hits.sh
COPY scripts/rotate-logs.sh /usr/local/bin/rotate-logs.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /usr/local/bin/aggregate-hits.sh \
              /usr/local/bin/rotate-logs.sh \
              /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
