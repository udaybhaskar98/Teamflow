import { app } from "./app";
import { startConsumers } from "./consumer";
import { prisma } from "./prisma";

const port = Number(process.env.PORT || 4005);
const server = app.listen(port, async () => {
  console.log(`notification-service listening on port ${port}`);
  await startConsumers();
});

async function shutdown(signal: string) {
  console.log(`notification-service received ${signal}, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
