import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { createProblemDetails } from "@cloudgrid/runtime";
import type { Context, Hono } from "hono";

const uploadTtlMs = 24 * 60 * 60 * 1000;
const maxUploadBytes = 25 * 1024 * 1024;

type TransferContext = Context;

interface UploadManifest {
  uploadId: string;
  projectId: string;
  ownerUserId: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  detectedFormat?: "jsonl" | "json_array" | "csv" | "zip";
  containedFiles: Array<{ path: string; format: string; sizeBytes: number }>;
  createdAt: string;
  expiresAt: string;
}

interface ExportManifest {
  exportId?: string;
  id?: string;
  projectId: string;
  filename: string;
  format: "jsonl" | "json_array" | "csv";
  status: string;
  sizeBytes?: number;
  sha256?: string;
  createdAt: string;
  expiresAt: string;
}

export interface DatasetTransferOptions {
  datasetTransferDir: string;
}

export function attachDatasetTransferRoutes<Env extends { Variables: object }>(
  app: Hono<Env>,
  options: DatasetTransferOptions,
) {
  app.post("/api/ai-eval/dataset-imports/uploads", (context) =>
    handleDatasetImportUpload(context, options),
  );
  app.get("/api/ai-eval/dataset-exports/:exportId/download", (context) =>
    handleDatasetExportDownload(context, options),
  );
}

export async function handleDatasetImportUpload(
  context: TransferContext,
  options: DatasetTransferOptions,
) {
  let body: Record<string, unknown>;
  try {
    body = await context.req.parseBody();
  } catch {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "Upload must use multipart form data");
  }
  const projectId = stringField(body.projectId);
  const file = body.file instanceof File ? body.file : undefined;
  const submittedFilename = stringField(body.filename);
  if (!projectId || !file) {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "projectId and file are required");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxUploadBytes) {
    return problem(
      context,
      "ERR-005",
      "PAYLOAD_TOO_LARGE",
      "Upload exceeds the dataset import size limit",
    );
  }

  const filename = sanitizeFilename(submittedFilename || file.name || "dataset-import");
  const detectedFormat = detectImportFormat(filename, file.type);
  if (!detectedFormat) {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "Unsupported dataset import format");
  }
  if (detectedFormat === "zip") {
    const zipProblem = validateZipSafety(bytes);
    if (zipProblem) {
      return problem(context, "ERR-001", "VALIDATION_FAILED", zipProblem);
    }
  }

  const uploadId = crypto.randomUUID();
  const createdAt = new Date();
  const manifest: UploadManifest = {
    uploadId,
    projectId,
    ownerUserId: "local",
    filename,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    detectedFormat,
    containedFiles: [],
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + uploadTtlMs).toISOString(),
  };

  const uploadDir = join(options.datasetTransferDir, "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, `${uploadId}.bin`), bytes);
  await writeFile(join(uploadDir, `${uploadId}.json`), JSON.stringify(manifest));

  return context.json({
    uploadId: manifest.uploadId,
    projectId: manifest.projectId,
    filename: manifest.filename,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
    detectedFormat: manifest.detectedFormat,
    containedFiles: manifest.containedFiles,
    expiresAt: manifest.expiresAt,
  });
}

export async function handleDatasetExportDownload(
  context: TransferContext,
  options: DatasetTransferOptions,
) {
  const exportId = context.req.param("exportId");
  if (!exportId || !/^[A-Za-z0-9._:-]+$/.test(exportId)) {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "exportId is invalid");
  }
  const exportDir = join(options.datasetTransferDir, "exports");
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(await readFile(join(exportDir, `${exportId}.json`), "utf8"));
  } catch {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "Dataset export was not found");
  }
  if (manifest.status !== "ready") {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "Dataset export is not ready");
  }
  if (Date.parse(manifest.expiresAt) <= Date.now()) {
    return problem(context, "ERR-001", "VALIDATION_FAILED", "Dataset export has expired");
  }
  const filename = sanitizeFilename(manifest.filename);
  const path = join(exportDir, filename);
  const artifactStat = await stat(path).catch(() => undefined);
  if (!artifactStat?.isFile()) {
    return problem(
      context,
      "ERR-001",
      "VALIDATION_FAILED",
      "Dataset export artifact was not found",
    );
  }
  const bytes = await readFile(path);
  return new Response(bytes, {
    headers: {
      "content-type": contentTypeForExport(manifest.format),
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${filename.replaceAll('"', "")}"`,
    },
  });
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFilename(filename: string): string {
  const value = basename(filename).replaceAll("\0", "").trim();
  return value || "dataset-transfer";
}

function detectImportFormat(
  filename: string,
  contentType: string,
): UploadManifest["detectedFormat"] {
  const ext = extname(filename).toLowerCase();
  if (ext === ".jsonl") return "jsonl";
  if (ext === ".json") return "json_array";
  if (ext === ".csv") return "csv";
  if (ext === ".zip") return "zip";
  if (contentType.includes("csv")) return "csv";
  if (contentType.includes("zip")) return "zip";
  if (contentType.includes("json")) return "json_array";
  return undefined;
}

function contentTypeForExport(format: ExportManifest["format"]): string {
  switch (format) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "json_array":
      return "application/json; charset=utf-8";
    default:
      return "application/jsonl; charset=utf-8";
  }
}

function validateZipSafety(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 4) {
    return "ZIP upload is invalid";
  }
  const firstSignature = view.getUint32(0, true);
  if (firstSignature !== 0x04034b50 && firstSignature !== 0x06054b50) {
    return "ZIP upload is invalid";
  }
  if (firstSignature === 0x06054b50) {
    return "ZIP upload contains no supported files";
  }

  let offset = 0;
  let supportedFiles = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameStart = offset + 30;
    const filenameEnd = filenameStart + filenameLength;
    const dataStart = filenameEnd + extraLength;
    if (filenameLength === 0 || filenameEnd > bytes.byteLength || dataStart > bytes.byteLength) {
      return "ZIP upload is invalid";
    }

    const entryName = new TextDecoder().decode(bytes.slice(filenameStart, filenameEnd));
    const entryProblem = validateZipEntryName(entryName);
    if (entryProblem) {
      return entryProblem;
    }
    if (!entryName.endsWith("/")) {
      supportedFiles++;
    }

    if (compressedSize === 0xffffffff || dataStart + compressedSize > bytes.byteLength) {
      break;
    }
    offset = dataStart + compressedSize;
  }
  if (supportedFiles === 0) {
    return "ZIP upload contains no supported files";
  }
  return undefined;
}

function validateZipEntryName(name: string): string | undefined {
  if (!name || name.includes("\\") || name.startsWith("/")) {
    return "ZIP entry path is unsafe";
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "..")) {
    return "ZIP entry path is unsafe";
  }
  const basename = parts.at(-1) ?? "";
  if (name.startsWith("__MACOSX/") || basename.startsWith(".")) {
    return "ZIP contains hidden system files";
  }
  if (name.endsWith("/")) {
    return undefined;
  }
  const ext = extname(basename).toLowerCase();
  if (ext === ".zip") {
    return "ZIP contains nested archive";
  }
  if (ext !== ".jsonl" && ext !== ".json" && ext !== ".csv") {
    return "ZIP contains unsupported file";
  }
  return undefined;
}

function problem(
  context: TransferContext,
  id: "ERR-001" | "ERR-005",
  code: string,
  detail: string,
) {
  const body = createProblemDetails({ id, code, detail, retryable: false });
  return context.json(body, body.status as 400 | 413 | 415);
}
