<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	const auth = getAuth();

	let email = $state("");
	let passphrase = $state("");

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await auth.login(email, passphrase);
			goto(resolve("/"));
		} catch {
			// error is displayed via auth.error
		}
	}
</script>

<div class="flex items-center justify-center min-h-screen px-4">
	<div class="w-full max-w-sm space-y-6 p-8">
		<h1 class="text-2xl font-bold text-center">Log In</h1>

		{#if auth.error}
			<div
				class="text-error-500 text-sm text-center p-3 bg-error-50 rounded-lg"
			>
				{auth.error}
			</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<label class="block space-y-1">
				<span class="text-sm font-medium">Email</span>
				<input
					type="email"
					class="input"
					bind:value={email}
					required
					autocomplete="email"
					placeholder="you@example.com"
				/>
			</label>

			<label class="block space-y-1">
				<span class="text-sm font-medium">Passphrase</span>
				<input
					type="password"
					class="input font-mono"
					bind:value={passphrase}
					required
					autocomplete="current-password"
					placeholder="word-word-word-word-0000"
				/>
			</label>

			<button
				type="submit"
				class="btn preset-filled-primary-500 w-full"
				disabled={auth.loading}
			>
				{auth.loading ? "Logging in…" : "Log In"}
			</button>
		</form>

		<div class="space-y-2 text-sm text-center">
			<p>
				Don't have an account?
				<a href={resolve("/signup")} class="underline">Sign up</a>
			</p>
			<p>
				Forgot your passphrase?
				<a href={resolve("/reset-password")} class="underline"
					>Reset it</a
				>
			</p>
		</div>
	</div>
</div>
