import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get("session_token");

	if (sessionToken) {
		try {
			const apiUrl = import.meta.env.VITE_API_URL;
			const res = await fetch(`${apiUrl}/auth/me`, {
				headers: { Cookie: `session_token=${sessionToken}` },
			});
			if (res.ok) {
				const body = await res.json();
				event.locals.user = body.user;
			} else {
				event.locals.user = null;
			}
		} catch {
			event.locals.user = null;
		}
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};
