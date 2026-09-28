<script lang="ts">
	import { apiFetch } from "$lib/services/api.js";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	interface Props {
		onSuccess: () => void;
	}

	let { onSuccess }: Props = $props();

	const auth = getAuth();

	let email = $state("");
	let otp = $state("");
	let codeSent = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function requestCode(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		loading = true;
		try {
			await apiFetch("/auth/login/init", {
				method: "POST",
				body: JSON.stringify({ email }),
			});
			codeSent = true;
		} catch (err) {
			error = err instanceof Error ? err.message : "Something went wrong";
		} finally {
			loading = false;
		}
	}

	async function verifyCode(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		loading = true;
		try {
			await apiFetch("/auth/login/verify-otp", {
				method: "POST",
				body: JSON.stringify({ email, otp }),
			});
			await auth.initAuth();
			onSuccess();
		} catch (err) {
			error = err instanceof Error ? err.message : "Verification failed";
		} finally {
			loading = false;
		}
	}

	function startOver() {
		codeSent = false;
		otp = "";
		error = null;
	}
</script>

<div class="space-y-4">
	{#if error}
		<div
			class="text-error-500 text-sm text-center p-3 bg-error-50 rounded-lg"
		>
			{error}
		</div>
	{/if}

	{#if !codeSent}
		<form onsubmit={requestCode} class="space-y-4">
			<label class="block space-y-1">
				<span class="text-sm font-medium">Email</span>
				<!-- "webauthn" lets PasskeySignIn offer passkeys in this field's autofill -->
				<input
					type="email"
					class="input"
					bind:value={email}
					required
					autocomplete="username webauthn"
					placeholder="you@example.com"
				/>
			</label>

			<button
				type="submit"
				class="btn preset-filled-primary-500 w-full"
				disabled={loading}
			>
				{loading ? "Sending code…" : "Email me a code"}
			</button>
		</form>
	{:else}
		<p class="text-sm text-surface-500">
			If an account exists for <strong>{email}</strong>, we've sent it a
			6-digit code. It expires in 10 minutes.
		</p>

		<form onsubmit={verifyCode} class="space-y-4">
			<label class="block space-y-1">
				<span class="text-sm font-medium">Sign-in code</span>
				<input
					type="text"
					inputmode="numeric"
					maxlength="6"
					class="input text-center text-2xl tracking-widest font-mono"
					bind:value={otp}
					required
					placeholder="000000"
					autocomplete="one-time-code"
				/>
			</label>

			<button
				type="submit"
				class="btn preset-filled-primary-500 w-full"
				disabled={loading || otp.length !== 6}
			>
				{loading ? "Signing in…" : "Sign in"}
			</button>
		</form>

		<p class="text-xs text-surface-500 text-center">
			Didn't receive it?
			<button type="button" class="underline" onclick={startOver}>
				Go back and resend
			</button>
		</p>
	{/if}
</div>
