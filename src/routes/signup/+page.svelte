<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	const auth = getAuth();

	let email = $state("");
	let password = $state("");
	let confirmPassword = $state("");
	let localError = $state<string | null>(null);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		localError = null;

		if (password !== confirmPassword) {
			localError = "Passwords do not match";
			return;
		}

		try {
			await auth.signup(email, password);
			goto(resolve("/"));
		} catch {
			// error is displayed via auth.error
		}
	}
</script>

<div class="flex items-center justify-center min-h-screen">
	<div class="w-full max-w-sm space-y-6 p-8">
		<h1 class="text-2xl font-bold text-center">Sign Up</h1>

		{#if localError || auth.error}
			<div class="text-error-500 text-sm text-center">
				{localError || auth.error}
			</div>
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
					minlength="8"
				/>
			</label>

			<label class="block space-y-1">
				<span class="text-sm font-medium">Confirm Password</span>
				<input
					type="password"
					class="input"
					bind:value={confirmPassword}
					required
					minlength="8"
				/>
			</label>

			<button
				type="submit"
				class="btn preset-filled w-full"
				disabled={auth.loading}
			>
				{auth.loading ? "Creating account…" : "Sign Up"}
			</button>
		</form>

		<p class="text-sm text-center">
			Already have an account?
			<a href={resolve("/login")} class="underline">Log in</a>
		</p>
	</div>
</div>
