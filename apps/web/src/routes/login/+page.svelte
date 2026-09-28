<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import EmailCodeSignIn from "$lib/components/EmailCodeSignIn.svelte";
	import PasskeyEnroll from "$lib/components/PasskeyEnroll.svelte";
	import PasskeySignIn from "$lib/components/PasskeySignIn.svelte";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import {
		dismissPasskeyPrompt,
		shouldPromptForPasskey,
	} from "$lib/services/passkey.js";

	const auth = getAuth();

	// Set after an email-code sign-in by a user who could use a passkey
	let promptUserId = $state<string | null>(null);

	function goHome() {
		goto(resolve("/"), { invalidateAll: true });
	}

	async function afterEmailCodeSignIn() {
		const userId = auth.user?.id;
		if (userId && (await shouldPromptForPasskey(userId))) {
			promptUserId = userId;
		} else {
			goHome();
		}
	}

	function dismissPrompt() {
		if (promptUserId) dismissPasskeyPrompt(promptUserId);
		goHome();
	}
</script>

<div class="flex items-center justify-center min-h-screen px-4">
	<div class="w-full max-w-sm space-y-6 p-8">
		{#if promptUserId}
			<div class="card preset-outlined-surface-200 p-6 rounded-xl">
				<PasskeyEnroll
					onCreated={goHome}
					onSkip={dismissPrompt}
					skipLabel="Not now"
				/>
			</div>
		{:else}
			<h1 class="text-2xl font-bold text-center">Log In</h1>

			<EmailCodeSignIn onSuccess={afterEmailCodeSignIn} />

			<PasskeySignIn autofill onSuccess={goHome} />

			<p class="text-sm text-center">
				Don't have an account?
				<a href={resolve("/signup")} class="underline">Sign up</a>
			</p>
		{/if}
	</div>
</div>
