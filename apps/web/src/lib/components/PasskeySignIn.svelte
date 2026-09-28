<script lang="ts">
	import { onMount } from "svelte";
	import {
		browserSupportsWebAuthn,
		browserSupportsWebAuthnAutofill,
		WebAuthnAbortService,
	} from "@simplewebauthn/browser";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import {
		isPasskeyCancellation,
		PASSKEY_SIGN_IN_FAILED,
		PasskeyVerificationError,
		signInWithPasskey,
	} from "$lib/services/passkey.js";

	interface Props {
		/**
		 * Offer passkeys in the autofill of an `autocomplete="username webauthn"`
		 * input while true. The request is aborted when this turns false.
		 */
		autofill: boolean;
		onSuccess: () => void;
	}

	let { autofill, onSuccess }: Props = $props();

	const auth = getAuth();

	// Resolved on the client only, so SSR and hydration render the same markup
	let supported = $state(false);
	let pending = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		supported = browserSupportsWebAuthn();
	});

	$effect(() => {
		if (!autofill) return;
		startAutofill();
		return () => WebAuthnAbortService.cancelCeremony();
	});

	async function startAutofill() {
		if (!(await browserSupportsWebAuthnAutofill())) return;
		await run(true);
	}

	async function run(useBrowserAutofill: boolean): Promise<boolean> {
		try {
			await signInWithPasskey(useBrowserAutofill);
			await auth.initAuth();
			onSuccess();
			return true;
		} catch (err) {
			// Autofill runs unprompted, so it only reports a passkey the user
			// actually picked being rejected
			const report = useBrowserAutofill
				? err instanceof PasskeyVerificationError
				: !isPasskeyCancellation(err);
			if (report) error = PASSKEY_SIGN_IN_FAILED;
			return false;
		}
	}

	async function handleClick() {
		error = null;
		pending = true;
		// Starting a new ceremony aborts the pending autofill request
		const signedIn = await run(false);
		pending = false;
		// Offer autofill again, e.g. after the user dismissed the dialog
		if (!signedIn && autofill) startAutofill();
	}
</script>

{#if supported}
	<div class="space-y-4">
		{#if error}
			<div
				class="text-error-500 text-sm text-center p-3 bg-error-50 rounded-lg"
			>
				{error}
			</div>
		{/if}

		<button
			type="button"
			class="btn preset-tonal-primary w-full"
			disabled={pending}
			onclick={handleClick}
		>
			{pending ? "Waiting for passkey…" : "Sign in with passkey"}
		</button>
	</div>
{/if}
