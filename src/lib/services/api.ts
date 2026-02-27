const API_BASE = "http://localhost:3001/api";

function getToken(): string | null {
	return localStorage.getItem("auth_token");
}

export function setToken(token: string): void {
	localStorage.setItem("auth_token", token);
}

export function clearToken(): void {
	localStorage.removeItem("auth_token");
}

export async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const token = getToken();
	const headers = new Headers(options.headers);

	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

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
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `API error: ${res.status}`);
	}

	return res.json();
}
