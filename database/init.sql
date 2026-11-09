-- TeamFlow uses one PostgreSQL database with one schema per service.
-- Prisma migrations also create these schemas, but this file makes a fresh
-- Docker volume predictable and documents the service boundaries.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS project;
CREATE SCHEMA IF NOT EXISTS task;
CREATE SCHEMA IF NOT EXISTS notification;
