# TeamFlow

TeamFlow is a small microservices project-management app for learning container builds and deployments. It has a React frontend, five Node.js/TypeScript services, one PostgreSQL database, and RabbitMQ for asynchronous events.

## Services

| Service | Port | Responsibility | Database schema |
| --- | ---: | --- | --- |
| `auth-service` | 4001 | Registration, login, JWTs, user profiles | `auth` |
| `organization-service` | 4002 | Organizations, memberships, roles | `organization` |
| `project-service` | 4003 | Projects, deadlines, project access | `project` |
| `task-service` | 4004 | Tasks, Kanban boards, comments, attachments | `task` |
| `notification-service` | 4005 | In-app notifications and project activity | `notification` |
| `frontend` | 5173 | React UI served by nginx in Docker | Browser storage |

PostgreSQL and RabbitMQ are shared infrastructure. Each backend service owns its own schema; services never query another service's schema directly.

## Architecture

```text
Browser
  |
  v
frontend (React)
  |  JWT REST calls
  +--> auth-service ---------> PostgreSQL (auth)
  +--> organization-service -> PostgreSQL (organization)
  +--> project-service ------> PostgreSQL (project)
  +--> task-service ---------> PostgreSQL (task)
  +--> notification-service -> PostgreSQL (notification)

organization-service --\
project-service --------+--> RabbitMQ topic exchange --> notification-service
task-service -----------/
```

- `organization-service` calls `auth-service` to look users up by email.
- `project-service` calls `organization-service` to check membership.
- `task-service` calls `project-service` and `organization-service` for access checks.
- `notification-service` calls `project-service` before returning a project activity feed.
- `task-service` publishes task and comment events to RabbitMQ.
- `notification-service` consumes those events and writes both notifications and activity rows.

Internal routes are reachable only through the cluster or Docker network. There is no separate internal API key; user requests are protected by JWTs.

## Quick start with Docker Compose

Requirements: Docker with Compose v2+.

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Open http://localhost:5173, register, create an organization, then create a project and tasks.

Useful endpoints:

| Target | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| RabbitMQ management | http://localhost:15672 (`teamflow` / `teamflow_dev_password`) |
| Swagger example | http://localhost:4001/docs |
| Health example | http://localhost:4001/health |

Stop the stack:

```bash
npm run docker:down
```

Stop and delete data volumes:

```bash
npm run docker:reset
```

## Dockerfiles

Each backend Dockerfile uses the same three-stage pattern so the final image stays small:

1. **deps** — install all dependencies and generate the Prisma client.
2. **build** — compile TypeScript into `dist/`.
3. **runtime** — copy only production dependencies, Prisma files, and compiled JavaScript.

The runtime container runs as a non-root `teamflow` user. PostgreSQL migrations are not baked into the image. Compose runs `prisma migrate deploy` before starting each service, and the Kubernetes manifests run the same command in an init container.

The frontend Dockerfile has two stages:

1. **build** — `npm ci` and `vite build`. `VITE_*` API URLs are compiled into the JavaScript, so they must be supplied as build arguments.
2. **runtime** — unprivileged nginx serves the static files on port 8080.

Build one backend image:

```bash
docker build -t teamflow/auth-service:local ./services/auth-service
```

Build the frontend for local browser access:

```bash
docker build \
  --build-arg VITE_AUTH_API_URL=http://localhost:4001 \
  --build-arg VITE_ORGANIZATION_API_URL=http://localhost:4002 \
  --build-arg VITE_PROJECT_API_URL=http://localhost:4003 \
  --build-arg VITE_TASK_API_URL=http://localhost:4004 \
  --build-arg VITE_NOTIFICATION_API_URL=http://localhost:4005 \
  -t teamflow/frontend:local ./frontend
```

On Apple Silicon, add `--platform linux/amd64` when the target cluster uses x86 nodes.

## Docker Compose layout

`docker-compose.yml` is intentionally explicit:

- **postgres** — stores one schema per service and runs `database/init.sql` on a fresh volume.
- **rabbitmq** — event bus for notifications and activity.
- **auth-service** — starts after PostgreSQL.
- **organization-service** — starts after PostgreSQL, RabbitMQ, and auth.
- **project-service** — starts after PostgreSQL, RabbitMQ, and organization.
- **task-service** — starts after PostgreSQL, RabbitMQ, organization, and project; stores uploaded files in the `task_uploads` volume.
- **notification-service** — starts after PostgreSQL, RabbitMQ, and project.
- **frontend** — built with browser-visible service URLs.

Every backend service has a health check. `depends_on` uses those health checks so dependent services start in a predictable order. In a real cluster, use readiness probes instead of startup ordering.


## Deploying to kind

The manifests in `K8s/` use local images (`teamflow-*-service:latest` and `teamflow-frontend:latest`) and `imagePullPolicy: IfNotPresent`, so kind must have the images loaded locally.

```bash
# 1. Build the backend images.
docker compose build

# 2. Build the frontend so nginx proxies /api/* to the backend Services.
#    VITE_API_BASE_URL=/ is what switches the browser to same-origin requests.
docker build --build-arg VITE_API_BASE_URL=/ -t teamflow-frontend:latest ./frontend

# 3. Load the images into your kind cluster.
CLUSTER=teamflow   # replace with your cluster name, e.g. my-cluster
kind load docker-image \
  teamflow-auth-service:latest \
  teamflow-organization-service:latest \
  teamflow-project-service:latest \
  teamflow-task-service:latest \
  teamflow-notification-service:latest \
  teamflow-frontend:latest \
  --name "$CLUSTER"

# 4. Create the namespace, config, and workloads.
kubectl apply -f K8s/

# 5. Wait for the stack.
kubectl -n teamflow rollout status statefulset/postgres
kubectl -n teamflow rollout status deployment/rabbitmq
kubectl -n teamflow rollout status deployment/auth-service
kubectl -n teamflow rollout status deployment/organization-service
kubectl -n teamflow rollout status deployment/project-service
kubectl -n teamflow rollout status deployment/task-service
kubectl -n teamflow rollout status deployment/notification-service
kubectl -n teamflow rollout status deployment/frontend

# 6. Open the frontend. The frontend nginx proxies /api/* internally.
kubectl -n teamflow port-forward svc/frontend-service 5173:80
```

Open http://localhost:5173.

Notes:

- Each backend Deployment runs `prisma migrate deploy` in an init container before the app starts.
- PostgreSQL runs `database/init.sql` through the `teamflow-configmap` only when its PVC is first initialized.
- `task-uploads-pvc.yml` persists attachment files. `fsGroup: 999` matches the `teamflow` user in the task image.
- Only `frontend-service` needs to be exposed. The other Services are `ClusterIP`.
- RabbitMQ management is optional: `kubectl -n teamflow port-forward svc/rabbitmq 15672:15672`.
- Change the values in `K8s/secret.yml` before using the stack outside local testing.
- These manifests replace the earlier kind demo resources (`auth-service-deployment`, `fe-deployment`, `user-service-deployment`, `postgres-statefulset`, and their Services). If that stack is already installed, remove the old namespace first: `kubectl delete namespace teamflow`. This deletes the old PostgreSQL data; omit it only if you intentionally migrate that data.
- To verify without deleting data, apply into a different namespace after replacing every `namespace: teamflow` value and the `kubectl -n teamflow` commands.

## Environment

Copy `.env.example` to `.env`. The important values are:

- `JWT_SECRET` — shared signing secret; all services verify tokens with it.
- `POSTGRES_*` — database credentials.
- `RABBITMQ_*` — RabbitMQ credentials.
- `*_SERVICE_URL` — internal service addresses. Compose uses service names; local npm development uses `localhost`.
- `STORAGE_DRIVER` — `local` stores attachments on disk; `s3` uses an S3-compatible bucket.
- `VITE_*_API_URL` — browser-visible API URLs baked into the frontend build.

For a single-origin gateway, set `VITE_API_BASE_URL=/` and route `/api/auth`, `/api/organization`, `/api/project`, `/api/task`, and `/api/notification` to the matching service. The gateway must strip the `/api/<service>` prefix because the frontend calls paths such as `/api/auth/auth/login`.

## Local development without containers

Start only infrastructure:

```bash
docker compose up -d postgres rabbitmq
```

Install packages and generate Prisma clients:

```bash
npm run install:all
```

Load the shared environment and start a service:

```bash
set -a
source .env
set +a

PORT=4001 \
DATABASE_URL='postgresql://teamflow:teamflow_dev_password@localhost:5432/teamflow?schema=auth' \
npm run dev --prefix services/auth-service
```

Use that service's port and schema for the others: `4002/organization`, `4003/project`, `4004/task`, `4005/notification`.

Start the frontend separately:

```bash
npm run dev --prefix frontend
```

Vite serves the UI at http://localhost:5173. Without explicit `VITE_*` values it uses the local ports above.

## Database migrations

Apply migrations for one service:

```bash
DATABASE_URL='postgresql://teamflow:teamflow_dev_password@localhost:5432/teamflow?schema=project' \
npm run prisma:migrate --prefix services/project-service
```

Create a migration after changing a schema:

```bash
npm exec --prefix services/project-service prisma migrate dev -- --name change_name
```

## Events

All events use the durable topic exchange `teamflow.events`:

```json
{
  "id": "uuid",
  "type": "task.assigned",
  "version": 1,
  "occurredAt": "2026-01-01T00:00:00.000Z",
  "actor": { "id": "uuid", "name": "Ada Lovelace" },
  "organizationId": "uuid",
  "projectId": "uuid",
  "data": {}
}
```

Published events:

- `project.created`, `project.updated`, `project.deleted`
- `task.created`, `task.updated`, `task.assigned`, `task.status_changed`, `task.deleted`
- `comment.created`, `comment.deleted`
- `org.member.added`, `org.member.removed`

`notification-service` handles task assignments, comments, membership changes, status changes, and the project activity feed. Failed messages are routed through `teamflow.dlx` to a durable dead-letter queue.

## Authentication

- Passwords are hashed with bcrypt.
- Access tokens are JWTs signed with `JWT_SECRET`, issued by `teamflow-auth`.
- Public APIs require `Authorization: Bearer <token>`.
- Roles are `OWNER`, `ADMIN`, and `MEMBER`.
- Access to projects, tasks, comments, and attachments is checked against organization/project membership.
- Logout is client-side only; the stateless token is discarded.

## API conventions

Success:

```json
{ "data": { "id": "..." } }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid",
    "details": {}
  }
}
```

Common status codes: `400` validation, `401` authentication, `403` permission, `404` missing resource, `409` conflict, `413` upload too large, `500` server error.

## Tests and checks

```bash
npm test
npm run typecheck
npm run build
```

Or run one package:

```bash
npm test --prefix services/task-service
npm run typecheck --prefix frontend
```

## Repository layout

```text
.
├── docker-compose.yml           # Local multi-service stack
├── database/init.sql            # Creates one PostgreSQL schema per service
├── frontend/                    # React + Vite + Tailwind, nginx Docker image
├── scripts/
│   ├── install-all.mjs          # Installs every service and generates Prisma clients
│   └── run-all.mjs              # Runs typecheck/test/build across all packages
├── services/
│   ├── auth-service/
│   ├── organization-service/
│   ├── project-service/
│   ├── task-service/
│   └── notification-service/
├── K8s/                         # Your own cluster manifests (not used by Compose)
└── .env.example
```

Each backend service has its own `prisma/schema.prisma`, migrations, Dockerfile, TypeScript config, and tests.

## Design notes

- Services are deliberately small and duplicate a few utilities instead of sharing an npm package, making each one easy to read and deploy independently.
- One PostgreSQL server with schema-per-service keeps local setup simple. Production can move each schema to a separate database or instance.
- Attachments use local disk by default. For multiple replicas, use `STORAGE_DRIVER=s3` and grant the workload `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject`.
- RabbitMQ delivery is at-least-once; notification and activity inserts use unique event IDs to stay idempotent.
- Kubernetes manifests, ingress, Terraform, and CI/CD are intentionally left to your deployment setup; Docker Compose is the only orchestrator defined here.
