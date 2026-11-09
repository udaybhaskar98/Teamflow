# Auth service: registration, login, JWT issuance, and user profiles.
# Stage 1: install dependencies and generate the Prisma client.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Prisma needs OpenSSL at install and runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# Stage 2: compile TypeScript to plain JavaScript.
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 3: small runtime image with production dependencies only.
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Copy the generated Prisma client from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
RUN groupadd -r teamflow && useradd -r -g teamflow teamflow
USER teamflow
EXPOSE 4001
# Migrations are run by Docker Compose before this command starts.
CMD ["node", "dist/index.js"]
