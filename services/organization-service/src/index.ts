import { app } from "./app";
import { eventBus } from "./events";
import { prisma } from "./prisma";

const port = Number(process.env.PORT || 4002);
const server = app.listen(port, () => console.log(`organization-service listening on port ${port}`));

async function shutdown(signal: string) {
  console.log(`organization-service received ${signal}, shutting down`);
  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), eventBus.close()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
