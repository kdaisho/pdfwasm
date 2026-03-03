const API_BASE = import.meta.env.VITE_API_URL;

export async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const headers = new Headers(options.headers);

	if (
		!headers.has("Content-Type") &&
		options.body &&
		!(options.body instanceof FormData)
	) {
		headers.set("Content-Type", "application/json");
	}

	const res = await fetch(`${API_BASE}${path}`, {
		...options,
		headers,
		credentials: "include",
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `API error: ${res.status}`);
	}

	return res.json();
}
