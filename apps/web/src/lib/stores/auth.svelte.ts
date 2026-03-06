import { apiFetch } from "../services/api.js";
import type { AuthUser } from "../types.js";

let user = $state<AuthUser | null>(null);
let loading = $state(false);
let error = $state<string | null>(null);
let initialized = $state(false);

export function getAuth() {
	return {
		get user() {
			return user;
		},
		get isAuthenticated() {
			return user !== null;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get initialized() {
			return initialized;
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

		async login(email: string, passphrase: string) {
			loading = true;
			error = null;
			try {
				const res = await apiFetch<{ user: AuthUser }>("/auth/login", {
					method: "POST",
					body: JSON.stringify({ email, passphrase }),
				});
				user = res.user;
			} catch (e) {
				error = e instanceof Error ? e.message : "Login failed";
				throw e;
			} finally {
				loading = false;
			}
		},

		async logout() {
			try {
				await apiFetch("/auth/logout", { method: "POST" });
			} catch {
				// ignore
			} finally {
				user = null;
				error = null;
				localStorage.removeItem("lastPdfId");
			}
		},
	};
}
