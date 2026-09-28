import { apiFetch } from "../services/api.js";
import type { AuthUser } from "../types.js";

let user = $state<AuthUser | null>(null);
let initialized = $state(false);

export function getAuth() {
	return {
		get user() {
			return user;
		},
		get isAuthenticated() {
			return user !== null;
		},
		get initialized() {
			return initialized;
		},

		initialize(initialUser: AuthUser | null) {
			user = initialUser;
			initialized = true;
		},

		async initAuth() {
			try {
				const res = await apiFetch<{ user: AuthUser }>("/auth/me");
				user = res.user;
			} catch {
				user = null;
			} finally {
				initialized = true;
			}
		},

		async logout() {
			try {
				await apiFetch("/auth/logout", { method: "POST" });
			} catch {
				// ignore
			} finally {
				user = null;
			}
		},
	};
}
