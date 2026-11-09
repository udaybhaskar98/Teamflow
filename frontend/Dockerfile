# React frontend: build static files, then serve them with nginx.
# Stage 1: compile the Vite app. API URLs are baked in at build time.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=
ARG VITE_AUTH_API_URL=
ARG VITE_ORGANIZATION_API_URL=
ARG VITE_PROJECT_API_URL=
ARG VITE_TASK_API_URL=
ARG VITE_NOTIFICATION_API_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_AUTH_API_URL=$VITE_AUTH_API_URL \
    VITE_ORGANIZATION_API_URL=$VITE_ORGANIZATION_API_URL \
    VITE_PROJECT_API_URL=$VITE_PROJECT_API_URL \
    VITE_TASK_API_URL=$VITE_TASK_API_URL \
    VITE_NOTIFICATION_API_URL=$VITE_NOTIFICATION_API_URL
RUN npm run build

# Stage 2: unprivileged nginx serving the static bundle on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
