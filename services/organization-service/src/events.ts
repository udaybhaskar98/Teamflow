import { randomUUID } from "crypto";
import amqp, { Connection, ConfirmChannel } from "amqplib";

export const EVENTS_EXCHANGE = "teamflow.events";

export interface TeamFlowEvent {
  id: string;
  type: string;
  version: 1;
  occurredAt: string;
  actor: { id: string; name: string };
  organizationId?: string;
  projectId?: string;
  data: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class EventPublisher {
  private connection?: Connection;
  private channel?: ConfirmChannel;
  private connecting?: Promise<ConfirmChannel>;

  private async connect(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const url = process.env.RABBITMQ_URL || "amqp://localhost:5672";
      let lastError: unknown;
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        try {
          const connection = await amqp.connect(url);
          connection.on("close", () => {
            this.connection = undefined;
            this.channel = undefined;
          });
          connection.on("error", (error) => console.error("RabbitMQ connection error", error.message));
          const channel = await connection.createConfirmChannel();
          await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
          this.connection = connection;
          this.channel = channel;
          return channel;
        } catch (error) {
          lastError = error;
          console.warn(`RabbitMQ connect attempt ${attempt} failed`);
          await sleep(Math.min(1000 * attempt, 5000));
        }
      }
      throw lastError;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  async publish(input: {
    type: string;
    actor: { id: string; name: string };
    data: Record<string, unknown>;
    organizationId?: string;
    projectId?: string;
  }): Promise<TeamFlowEvent | undefined> {
    const event: TeamFlowEvent = {
      id: randomUUID(),
      type: input.type,
      version: 1,
      occurredAt: new Date().toISOString(),
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      data: input.data
    };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const channel = await this.connect();
        channel.publish(
          EVENTS_EXCHANGE,
          input.type,
          Buffer.from(JSON.stringify(event)),
          { persistent: true, contentType: "application/json", messageId: event.id }
        );
        await channel.waitForConfirms();
        return event;
      } catch (error) {
        console.warn(`Event publish attempt ${attempt} failed for ${input.type}`);
        this.channel = undefined;
        if (attempt === 3) {
          console.error(`Could not publish ${input.type}; the primary operation remains committed`, error);
          return undefined;
        }
        await sleep(500 * attempt);
      }
    }
    return undefined;
  }

  async close() {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
  }
}

export const eventBus = new EventPublisher();
