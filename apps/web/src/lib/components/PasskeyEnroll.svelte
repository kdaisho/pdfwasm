<script lang="ts">
	import { toaster } from "$lib/stores/toaster";
	import {
		passkeyRegistrationError,
		registerPasskey,
	} from "$lib/services/passkey.js";

	interface Props {
		/** Called once a passkey has been created. */
		onCreated: () => void;
		onSkip: () => void;
		skipLabel: string;
	}

	let { onCreated, onSkip, skipLabel }: Props = $props();

	let pending = $state(false);
	let error = $state<string | null>(null);

	async function create() {
		error = null;
		pending = true;
		try {
			await registerPasskey();
			toaster.success({ title: "Passkey created" });
			onCreated();
		} catch (err) {
			error = passkeyRegistrationError(err);
		} finally {
			pending = false;
		}
	}
</script>

<div class="space-y-4">
	<div>
		<h2 class="text-xl font-semibold mb-1">Create a passkey</h2>
		<p class="text-sm text-surface-500">
			Next time, sign in with your fingerprint, face, or screen lock
			instead of waiting for an email code.
		</p>
	</div>

	{#if error}
		<div class="text-error-500 text-sm p-3 bg-error-50 rounded-lg">
			{error}
		</div>
	{/if}

	<button
		type="button"
		class="btn preset-filled-primary-500 w-full"
		disabled={pending}
		onclick={create}
	>
		{pending ? "Waiting for passkey…" : "Create a passkey"}
	</button>

	<button
		type="button"
		class="btn preset-tonal-surface w-full"
		disabled={pending}
		onclick={onSkip}
	>
		{skipLabel}
	</button>
</div>
