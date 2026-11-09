import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Document as LangDocument } from "@langchain/core/documents";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_ROOT = path.resolve(__dirname, "../data/vectorstores");

const embeddings = new OllamaEmbeddings({
  model: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
});

function workspaceIndexPath(workspaceId: string) {
  // Workspace IDs are validated UUIDs by the API route before reaching here.
  return path.join(INDEX_ROOT, workspaceId);
}

export async function indexFinancialDocument(args: {
  workspaceId: string;
  documentId: string;
  fileName: string;
  text: string;
}) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 900,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const chunks = await splitter.createDocuments(
    [args.text],
    [{
      workspaceId: args.workspaceId,
      documentId: args.documentId,
      fileName: args.fileName,
      sourceType: "uploaded_document",
    }],
  );

  if (!chunks.length) throw new Error("No text chunks were produced.");

  const indexPath = workspaceIndexPath(args.workspaceId);
  await fs.mkdir(indexPath, { recursive: true });

  let store: FaissStore;
  try {
    store = await FaissStore.load(indexPath, embeddings);
    await store.addDocuments(chunks);
  } catch {
    store = await FaissStore.fromDocuments(chunks, embeddings);
  }

  await store.save(indexPath);
  return { chunkCount: chunks.length };
}

export async function retrieveFinancialDocuments(
  workspaceId: string,
  question: string,
  k = 5,
): Promise<{ context: string; sources: Array<{ documentId: string; fileName: string; excerpt: string }> }> {
  const indexPath = workspaceIndexPath(workspaceId);
  await fs.access(indexPath);

  const store = await FaissStore.load(indexPath, embeddings);
  const results = await store.similaritySearch(question, k, { workspaceId });

  const sources = results.map((doc) => ({
    documentId: String(doc.metadata.documentId ?? ""),
    fileName: String(doc.metadata.fileName ?? "Uploaded document"),
    excerpt: doc.pageContent.slice(0, 700),
  }));

  const context = results.map((doc, i) =>
    `[Source ${i + 1}: ${String(doc.metadata.fileName ?? "document")} | documentId=${String(doc.metadata.documentId ?? "")}]\n${doc.pageContent}`,
  ).join("\n\n---\n\n");

  return { context, sources };
}

export async function deleteDocumentFromIndex(
  workspaceId: string,
  documentId: string,
) {
  // FAISS metadata deletion is not reliably supported across package versions.
  // Rebuild the workspace index from remaining processed documents instead.
  // This operation is intentionally implemented in the document service where
  // source files and DB metadata are available.
  void workspaceId;
  void documentId;
}
