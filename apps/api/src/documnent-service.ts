import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import { prisma } from "../../../services/database/src/db.js";
import { indexFinancialDocument } from "./rag.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(__dirname, "../data/uploads");

export async function processUploadedFinancialDocument(args: {
  workspaceId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: args.workspaceId },
    select: { id: true },
  });
  if (!workspace) throw new Error("Workspace not found.");

  const ext = path.extname(args.originalName).toLowerCase();
  const allowed = new Set([".pdf", ".txt", ".csv"]);
  if (!allowed.has(ext)) throw new Error("Only PDF, TXT, and CSV files are supported.");

  const sha256 = crypto.createHash("sha256").update(args.buffer).digest("hex");
  const folder = path.join(UPLOAD_ROOT, args.workspaceId);
  await fs.mkdir(folder, { recursive: true });
  const storedName = `${crypto.randomUUID()}${ext}`;
  const absolutePath = path.join(folder, storedName);
  await fs.writeFile(absolutePath, args.buffer, { flag: "wx" });

  const document = await prisma.document.create({
    data: {
      workspaceId: args.workspaceId,
      fileName: path.basename(args.originalName),
      mimeType: args.mimeType,
      storageKey: path.relative(UPLOAD_ROOT, absolutePath),
      sha256,
      fileSize: BigInt(args.buffer.byteLength),
      status: "PROCESSING",
    },
  });

  try {
    let extractedText = "";
    if (ext === ".pdf") {
  const parser = new PDFParse({
    data: new Uint8Array(args.buffer),
  });

  try {
    const parsed = await parser.getText();
    extractedText = parsed.text ?? "";
  } finally {
    await parser.destroy();
  }
} else {
  extractedText = args.buffer.toString("utf8");
}
    extractedText = extractedText.replace(/\u0000/g, "").trim();
    if (extractedText.length < 20) {
      throw new Error("The document contains too little extractable text. Scanned PDFs may require OCR.");
    }

    const indexing = await indexFinancialDocument({
      workspaceId: args.workspaceId,
      documentId: document.id,
      fileName: document.fileName,
      text: extractedText,
    });

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { status: "PROCESSED" },
      select: { id: true, fileName: true, mimeType: true, fileSize: true, status: true, createdAt: true },
    });

    return { document: updated, chunkCount: indexing.chunkCount };
  } catch (error) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "FAILED" },
    }).catch(() => undefined);
    throw error;
  }
}
