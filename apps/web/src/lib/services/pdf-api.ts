const API_BASE = import.meta.env.VITE_API_URL;

export interface PdfDocumentMeta {
	id: string;
	filename: string;
	fileSize: number;
	pageCount: number;
	uploadedAt: string;
}

export async function uploadPdf(file: File): Promise<PdfDocumentMeta> {
	const form = new FormData();
	form.append("file", file);

	const res = await fetch(`${API_BASE}/pdfs/upload`, {
		method: "POST",
		body: form,
		credentials: "include",
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Upload failed: ${res.status}`);
	}

	return res.json();
}

export async function listPdfs(): Promise<PdfDocumentMeta[]> {
	const res = await fetch(`${API_BASE}/pdfs/list`, {
		credentials: "include",
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `List failed: ${res.status}`);
	}

	const body: { documents: PdfDocumentMeta[] } = await res.json();
	return body.documents;
}

export async function downloadPdf(id: string): Promise<Uint8Array> {
	const res = await fetch(`${API_BASE}/pdfs/download/${id}`, {
		credentials: "include",
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Download failed: ${res.status}`);
	}

	const buffer = await res.arrayBuffer();
	return new Uint8Array(buffer);
}

export async function setLastPdf(pdfId: string): Promise<void> {
	const res = await fetch(`${API_BASE}/pdfs/last`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ pdfId }),
		credentials: "include",
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Set last PDF failed: ${res.status}`);
	}
}

export async function deletePdf(id: string): Promise<void> {
	const res = await fetch(`${API_BASE}/pdfs/${id}`, {
		method: "DELETE",
		credentials: "include",
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Delete failed: ${res.status}`);
	}
}
