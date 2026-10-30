import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const SAFE_EXT = /^\.(jpg|jpeg|png|webp|gif|pdf|xlsx|csv)$/i;

/**
 * Files (product images, breakage photos, POD) go to MinIO/S3 when S3_* env vars are set, else to a
 * local folder for development. Files are served through the API (/api/files/:key) behind login.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  private s3: S3Client | null = null;
  private bucket = process.env.S3_BUCKET || "kailash-erp";
  private dir = path.resolve(process.env.UPLOAD_DIR || "./uploads");

  constructor() {
    if (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
      this.s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || "ap-south-1",
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
      });
    } else {
      this.log.log(`S3 not configured; storing uploads in ${this.dir}`);
    }
  }

  /** Create the private bucket on a fresh MinIO so the first upload doesn't fail. */
  async onModuleInit() {
    if (!this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.log.log(`Created bucket ${this.bucket}`);
      } catch (e) {
        this.log.warn(`Bucket ${this.bucket} not available yet: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  async save(buffer: Buffer, originalName: string, mimeType: string, folder = "misc"): Promise<{ key: string; url: string }> {
    const ext = path.extname(originalName).toLowerCase();
    const key = `${folder.replace(/[^a-z0-9-]/gi, "")}/${randomUUID()}${SAFE_EXT.test(ext) ? ext : ""}`;
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimeType }));
    } else {
      const file = path.join(this.dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buffer);
    }
    return { key, url: `/api/files/${key}` };
  }

  async read(key: string): Promise<{ body: Buffer; contentType?: string }> {
    if (key.includes("..")) throw new NotFoundException();
    if (this.s3) {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const chunks: Buffer[] = [];
      for await (const c of out.Body as Readable) chunks.push(Buffer.from(c));
      return { body: Buffer.concat(chunks), contentType: out.ContentType };
    }
    try {
      return { body: await readFile(path.join(this.dir, key)) };
    } catch {
      throw new NotFoundException("File not found");
    }
  }
}
