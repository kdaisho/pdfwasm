<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	const auth = getAuth();

	let email = $state("");
	let password = $state("");

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await auth.login(email, password);
			goto(resolve("/"));
		} catch {
			// error is displayed via auth.error
		}
	}
</script>

<div class="flex items-center justify-center min-h-screen">
	<div class="w-full max-w-sm space-y-6 p-8">
		<h1 class="text-2xl font-bold text-center">Log In</h1>

		{#if auth.error}
			<div class="text-error-500 text-sm text-center">{auth.error}</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<label class="block space-y-1">
				<span class="text-sm font-medium">Email</span>
				<input type="email" class="input" bind:value={email} required />
			</label>

			<label class="block space-y-1">
				<span class="text-sm font-medium">Password</span>
				<input
					type="password"
					class="input"
					bind:value={password}
					required
				/>
			</label>

			<button
				type="submit"
				class="btn preset-filled w-full"
				disabled={auth.loading}
			>
				{auth.loading ? "Logging in…" : "Log In"}
			</button>
		</form>

		<p class="text-sm text-center">
			Don't have an account?
			<a href={resolve("/signup")} class="underline">Sign up</a>
		</p>
	</div>
</div>
