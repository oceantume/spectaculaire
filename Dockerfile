FROM node:22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache sqlite
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-analytics-format.conf /etc/nginx/conf.d/00-analytics.conf
COPY scripts/aggregate-hits.sh /usr/local/bin/aggregate-hits.sh
COPY scripts/rotate-logs.sh /usr/local/bin/rotate-logs.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /usr/local/bin/aggregate-hits.sh \
              /usr/local/bin/rotate-logs.sh \
              /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
