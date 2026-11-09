import { createReadStream, ReadStream } from "fs";
import { access, mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

export class AttachmentMissingError extends Error {
  constructor() {
    super("The stored attachment is missing");
    this.name = "AttachmentMissingError";
  }
}

export interface AttachmentStorage {
  save(buffer: Buffer, originalName: string, contentType?: string): Promise<{ storedName: string }>;
  open(storedName: string): Promise<Readable>;
  remove(storedName: string): Promise<void>;
}

export class LocalAttachmentStorage implements AttachmentStorage {
  private readonly directory: string;

  constructor(directory = process.env.UPLOAD_DIR || "./uploads") {
    this.directory = path.resolve(directory);
  }

  private filePath(storedName: string): string {
    if (path.basename(storedName) !== storedName) throw new Error("Invalid stored file name");
    return path.join(this.directory, storedName);
  }

  async save(buffer: Buffer, originalName: string): Promise<{ storedName: string }> {
    await mkdir(this.directory, { recursive: true });
    const extension = path.extname(originalName).toLowerCase().slice(0, 10);
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(this.filePath(storedName), buffer, { mode: 0o600 });
    return { storedName };
  }

  createReadStream(storedName: string): ReadStream {
    return createReadStream(this.filePath(storedName));
  }

  async open(storedName: string): Promise<Readable> {
    const filename = this.filePath(storedName);
    try {
      await access(filename);
    } catch {
      throw new AttachmentMissingError();
    }
    return createReadStream(filename);
  }

  async remove(storedName: string): Promise<void> {
    try {
      await unlink(this.filePath(storedName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

interface S3Sender {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface S3AttachmentStorageOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  keyPrefix?: string;
  client?: S3Sender;
}

function normalizePrefix(prefix: string | undefined): string {
  const value = (prefix ?? "attachments/").replace(/^\/+/, "");
  return value === "" ? "" : value.replace(/\/+$/, "") + "/";
}

function isMissingObject(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate?.name === "NoSuchKey" ||
    candidate?.Code === "NoSuchKey" ||
    candidate?.code === "NoSuchKey" ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}

export class S3AttachmentStorage implements AttachmentStorage {
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly client: S3Sender;

  constructor(options: S3AttachmentStorageOptions) {
    if (!options.bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    this.bucket = options.bucket;
    this.prefix = normalizePrefix(options.keyPrefix);
    this.client =
      options.client ??
      new S3Client({
        region: options.region || "us-east-1",
        endpoint: options.endpoint || undefined,
        forcePathStyle: options.forcePathStyle ?? false
      });
  }

  private key(storedName: string): string {
    if (
      !storedName ||
      storedName.startsWith("/") ||
      storedName.includes("..") ||
      !storedName.startsWith(this.prefix)
    ) {
      throw new Error("Invalid stored object name");
    }
    return storedName;
  }

  async save(buffer: Buffer, originalName: string, contentType?: string): Promise<{ storedName: string }> {
    const extension = path.extname(originalName).toLowerCase().slice(0, 10);
    const storedName = `${this.prefix}${randomUUID()}${extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storedName,
        Body: buffer,
        ContentType: contentType
      })
    );
    return { storedName };
  }

  async open(storedName: string): Promise<Readable> {
    try {
      const response = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(storedName) })
      )) as { Body?: Readable | { transformToWebStream(): ReadableStream } };
      if (!response.Body) throw new AttachmentMissingError();
      if (response.Body instanceof Readable) return response.Body;
      return Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
    } catch (error) {
      if (error instanceof AttachmentMissingError) throw error;
      if (isMissingObject(error)) throw new AttachmentMissingError();
      throw error;
    }
  }

  async remove(storedName: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(storedName) })
      );
    } catch (error) {
      if (!isMissingObject(error)) throw error;
    }
  }
}

export function createAttachmentStorage(env: NodeJS.ProcessEnv = process.env): AttachmentStorage {
  const driver = (env.STORAGE_DRIVER || "local").toLowerCase();
  if (driver === "local") return new LocalAttachmentStorage(env.UPLOAD_DIR || "./uploads");
  if (driver === "s3") {
    return new S3AttachmentStorage({
      bucket: env.S3_BUCKET || "",
      region: env.S3_REGION || env.AWS_REGION || env.AWS_DEFAULT_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      keyPrefix: env.S3_KEY_PREFIX
    });
  }
  throw new Error(`Unsupported STORAGE_DRIVER: ${driver}`);
}

export const storage: AttachmentStorage = createAttachmentStorage();
