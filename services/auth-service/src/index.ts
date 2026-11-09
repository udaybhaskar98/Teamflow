import { app } from "./app";
import { prisma } from "./prisma";

const port = Number(process.env.PORT || 4001);

const server = app.listen(port, () => {
  console.log(`auth-service listening on port ${port}`);
});

async function shutdown(signal: string) {
  console.log(`auth-service received ${signal}, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
