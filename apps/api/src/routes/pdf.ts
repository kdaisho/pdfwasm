import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { mkdir, unlink, writeFile, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { pdfDocuments } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";

const pdf = new Hono<AuthEnv>();

pdf.use("/*", authMiddleware);

const storagePath = process.env.PDF_STORAGE_PATH || "./storage/pdfs";

pdf.post("/upload", async (c) => {
	const userId = c.get("userId");
	const body = await c.req.parseBody();
	const file = body["file"];

	if (!file || !(file instanceof File)) {
		return c.json({ error: "No PDF file provided" }, 400);
	}

	if (!file.name.endsWith(".pdf")) {
		return c.json({ error: "Only PDF files are allowed" }, 400);
	}

	await mkdir(storagePath, { recursive: true });

	const fileId = randomUUID();
	const filePath = join(storagePath, `${fileId}.pdf`);
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	await writeFile(filePath, buffer);

	const [doc] = await db
		.insert(pdfDocuments)
		.values({
			userId,
			filename: file.name,
			filePath,
			fileSize: buffer.length,
		})
		.returning();

	return c.json(
		{
			id: doc.id,
			filename: doc.filename,
			fileSize: doc.fileSize,
			uploadedAt: doc.uploadedAt,
		},
		201,
	);
});

pdf.get("/list", async (c) => {
	const userId = c.get("userId");

	const docs = await db
		.select({
			id: pdfDocuments.id,
			filename: pdfDocuments.filename,
			fileSize: pdfDocuments.fileSize,
			pageCount: pdfDocuments.pageCount,
			uploadedAt: pdfDocuments.uploadedAt,
		})
		.from(pdfDocuments)
		.where(eq(pdfDocuments.userId, userId))
		.orderBy(pdfDocuments.uploadedAt);

	return c.json({ documents: docs });
});

pdf.get("/download/:id", async (c) => {
	const userId = c.get("userId");
	const docId = c.req.param("id");

	const [doc] = await db
		.select()
		.from(pdfDocuments)
		.where(and(eq(pdfDocuments.id, docId), eq(pdfDocuments.userId, userId)))
		.limit(1);

	if (!doc) {
		return c.json({ error: "Document not found" }, 404);
	}

	const fileStats = await stat(doc.filePath).catch(() => null);
	if (!fileStats) {
		return c.json({ error: "File not found on disk" }, 404);
	}

	const fileBuffer = await readFile(doc.filePath);

	return c.body(fileBuffer, 200, {
		"Content-Type": "application/pdf",
		"Content-Disposition": `attachment; filename="${doc.filename}"`,
		"Content-Length": fileStats.size.toString(),
	});
});

pdf.delete("/:id", async (c) => {
	const userId = c.get("userId");
	const docId = c.req.param("id");

	const [doc] = await db
		.select()
		.from(pdfDocuments)
		.where(and(eq(pdfDocuments.id, docId), eq(pdfDocuments.userId, userId)))
		.limit(1);

	if (!doc) {
		return c.json({ error: "Document not found" }, 404);
	}

	await unlink(doc.filePath).catch(() => {});

	await db.delete(pdfDocuments).where(eq(pdfDocuments.id, docId));

	return c.json({ success: true });
});

export default pdf;
