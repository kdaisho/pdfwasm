<script lang="ts">
	import { onMount } from "svelte";
	import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import {
		isPasskeyCancellation,
		PASSKEY_SIGN_IN_FAILED,
		signInWithPasskey,
	} from "$lib/services/passkey.js";

	interface Props {
		/**
		 * The account to sign in to. Place this inside the form holding the
		 * email input, so the button can check it the way submitting would.
		 */
		email: string;
		onSuccess: () => void;
		/**
		 * Lead the form: filled style, and the form's default button, so
		 * pressing Enter in the email field signs in with a passkey
		 */
		primary?: boolean;
	}

	let { email, onSuccess, primary = false }: Props = $props();

	const auth = getAuth();

	// Resolved on the client only, so SSR and hydration render the same markup
	let supported = $state(false);
	let pending = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		supported = browserSupportsWebAuthn();
	});

	async function handleClick(
		e: MouseEvent & { currentTarget: HTMLButtonElement },
	) {
		// Same validation as submitting, without submitting the form
		e.preventDefault();
		const form = e.currentTarget.form;
		if (form && !form.reportValidity()) return;

		error = null;
		pending = true;
		try {
			await signInWithPasskey(email);
			await auth.initAuth();
			onSuccess();
		} catch (err) {
			if (!isPasskeyCancellation(err)) error = PASSKEY_SIGN_IN_FAILED;
		} finally {
			pending = false;
		}
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
			type={primary ? "submit" : "button"}
			class="btn w-full {primary
				? 'preset-filled-primary-500'
				: 'preset-tonal-primary'}"
			disabled={pending}
			onclick={handleClick}
		>
			{pending ? "Waiting for passkey…" : "Sign in with passkey"}
		</button>
	</div>
{/if}
