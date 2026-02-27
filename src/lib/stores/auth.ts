import { apiFetch, setToken, clearToken } from "../services/api.js";

interface AuthUser {
	id: string;
	email: string;
}

interface AuthResponse {
	token: string;
	user: AuthUser;
}

let user = $state<AuthUser | null>(null);
let loading = $state(false);
let error = $state<string | null>(null);

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

		async signup(email: string, password: string) {
			loading = true;
			error = null;
			try {
				const res = await apiFetch<AuthResponse>("/auth/signup", {
					method: "POST",
					body: JSON.stringify({ email, password }),
				});
				setToken(res.token);
				user = res.user;
			} catch (e) {
				error = e instanceof Error ? e.message : "Signup failed";
				throw e;
			} finally {
				loading = false;
			}
		},

		async login(email: string, password: string) {
			loading = true;
			error = null;
			try {
				const res = await apiFetch<AuthResponse>("/auth/login", {
					method: "POST",
					body: JSON.stringify({ email, password }),
				});
				setToken(res.token);
				user = res.user;
			} catch (e) {
				error = e instanceof Error ? e.message : "Login failed";
				throw e;
			} finally {
				loading = false;
			}
		},

		logout() {
			clearToken();
			user = null;
			error = null;
		},
	};
}
