<script lang="ts">
	import { beforeNavigate, goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { onMount } from "svelte";
	import { Steps } from "@skeletonlabs/skeleton-svelte";
	import { apiFetch } from "$lib/services/api.js";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import type { AuthUser } from "$lib/types.js";

	const auth = getAuth();

	let step = $state(0);

	// Step 0 – email
	let email = $state("");
	let emailError = $state<string | null>(null);
	let emailLoading = $state(false);

	// Step 1 – OTP
	let otp = $state("");
	let otpError = $state<string | null>(null);
	let otpLoading = $state(false);

	// Step 2 – passphrase handover
	let passphrase = $state("");
	let verifiedToken = $state("");
	let copied = $state(false);
	let savedChecked = $state(false);
	let completeLoading = $state(false);
	let completeError = $state<string | null>(null);

	const STORAGE_KEY = "reset_state";

	function persistState() {
		try {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					step,
					email,
					verifiedToken,
					passphrase,
					savedAt: Date.now(),
				}),
			);
		} catch {
			// do nothing
		}
	}

	onMount(() => {
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw);
			if (Date.now() - saved.savedAt > 30 * 60 * 1000) {
				sessionStorage.removeItem(STORAGE_KEY);
				return;
			}
			if (saved.step < 1 || saved.step > 2) {
				sessionStorage.removeItem(STORAGE_KEY);
				return;
			}
			if (
				saved.step === 2 &&
				(!saved.verifiedToken || !saved.passphrase)
			) {
				sessionStorage.removeItem(STORAGE_KEY);
				return;
			}
			step = saved.step;
			email = saved.email;
			verifiedToken = saved.verifiedToken;
			passphrase = saved.passphrase;
		} catch {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	});

	beforeNavigate(({ to }) => {
		if (to && to.url.pathname !== "/reset-password")
			sessionStorage.removeItem(STORAGE_KEY);
	});

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		emailError = null;
		emailLoading = true;
		try {
			await apiFetch("/auth/reset/init", {
				method: "POST",
				body: JSON.stringify({ email }),
			});
			step = 1;
			persistState();
		} catch (err) {
			emailError =
				err instanceof Error ? err.message : "Something went wrong";
		} finally {
			emailLoading = false;
		}
	}

	async function submitOtp(e: SubmitEvent) {
		e.preventDefault();
		otpError = null;
		otpLoading = true;
		try {
			const res = await apiFetch<{
				verifiedToken: string;
				passphrase: string;
			}>("/auth/reset/verify-otp", {
				method: "POST",
				body: JSON.stringify({ email, otp }),
			});
			verifiedToken = res.verifiedToken;
			passphrase = res.passphrase;
			step = 2;
			persistState();
		} catch (err) {
			otpError =
				err instanceof Error ? err.message : "Verification failed";
		} finally {
			otpLoading = false;
		}
	}

	async function copyPassphrase() {
		await navigator.clipboard.writeText(passphrase);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function complete() {
		completeError = null;
		completeLoading = true;
		try {
			await apiFetch<{ user: AuthUser }>("/auth/reset/complete", {
				method: "POST",
				body: JSON.stringify({ verifiedToken }),
			});
			await auth.initAuth();
			sessionStorage.removeItem(STORAGE_KEY);
			goto(resolve("/"));
		} catch (err) {
			completeError =
				err instanceof Error ? err.message : "Failed to complete reset";
		} finally {
			completeLoading = false;
		}
	}

	const stepTitles = ["Your email", "Verify email", "New passphrase"];
</script>

<div class="flex items-center justify-center min-h-screen px-4 py-12">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold">Reset passphrase</h1>
			<p class="mt-2 text-sm text-surface-500">
				Remembered it?
				<a href={resolve("/login")} class="underline">Log in</a>
			</p>
		</div>

		<Steps {step} count={3} linear class="w-full">
			<Steps.List class="mb-8">
				{#each stepTitles as title, index (title)}
					<Steps.Item {index} class="flex-1">
						<Steps.Trigger
							class="flex flex-col items-center gap-1 w-full"
						>
							<Steps.Indicator
								class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
								{step > index
									? 'preset-filled-success-500'
									: step === index
										? 'preset-filled-primary-500'
										: 'preset-outlined-surface-500'}"
							>
								{#if step > index}
									✓
								{:else}
									{index + 1}
								{/if}
							</Steps.Indicator>
							<span
								class="text-xs text-surface-500 hidden sm:block"
								>{title}</span
							>
						</Steps.Trigger>
						{#if index < stepTitles.length - 1}
							<Steps.Separator
								class="h-px bg-surface-300 flex-1 mt-4"
							/>
						{/if}
					</Steps.Item>
				{/each}
			</Steps.List>

			<!-- Step 0: Email -->
			<Steps.Content index={0}>
				<div class="card preset-outlined-surface-200 p-6 rounded-xl">
					<h2 class="text-xl font-semibold mb-1">Enter your email</h2>
					<p class="text-sm text-surface-500 mb-6">
						We'll send a 6-digit code to verify your identity.
					</p>

					{#if emailError}
						<div
							class="text-error-500 text-sm mb-4 p-3 bg-error-50 rounded-lg"
						>
							{emailError}
						</div>
					{/if}

					<form onsubmit={submitEmail} class="space-y-4">
						<label class="block space-y-1">
							<span class="text-sm font-medium"
								>Email address</span
							>
							<input
								type="email"
								class="input"
								bind:value={email}
								required
								placeholder="you@example.com"
								autocomplete="email"
							/>
						</label>
						<button
							type="submit"
							class="btn preset-filled-primary-500 w-full"
							disabled={emailLoading}
						>
							{emailLoading
								? "Sending code…"
								: "Send verification code"}
						</button>
					</form>
				</div>
			</Steps.Content>

			<!-- Step 1: OTP -->
			<Steps.Content index={1}>
				<div class="card preset-outlined-surface-200 p-6 rounded-xl">
					<h2 class="text-xl font-semibold mb-1">Check your inbox</h2>
					<p class="text-sm text-surface-500 mb-6">
						Enter the 6-digit code sent to <strong>{email}</strong>.
						It expires in 10 minutes.
					</p>

					{#if otpError}
						<div
							class="text-error-500 text-sm mb-4 p-3 bg-error-50 rounded-lg"
						>
							{otpError}
						</div>
					{/if}

					<form onsubmit={submitOtp} class="space-y-4">
						<label class="block space-y-1">
							<span class="text-sm font-medium"
								>Verification code</span
							>
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
							disabled={otpLoading || otp.length !== 6}
						>
							{otpLoading ? "Verifying…" : "Verify code"}
						</button>
					</form>

					<p class="text-xs text-surface-500 mt-4 text-center">
						Didn't receive it?
						<button
							class="underline"
							onclick={() => {
								step = 0;
								otp = "";
								otpError = null;
								sessionStorage.removeItem(STORAGE_KEY);
							}}
						>
							Go back and resend
						</button>
					</p>
				</div>
			</Steps.Content>

			<!-- Step 2: New passphrase handover -->
			<Steps.Content index={2}>
				<div
					class="card preset-outlined-surface-200 p-6 rounded-xl space-y-6"
				>
					<div>
						<h2 class="text-xl font-semibold mb-1">
							Your new passphrase
						</h2>
						<p class="text-sm text-surface-500">
							This is the only time you'll see it. Store it
							somewhere safe — your old passphrase no longer
							works.
						</p>
					</div>

					<div>
						<div
							class="font-mono text-base sm:text-lg font-semibold tracking-wide bg-surface-100-800 border border-surface-300 rounded-xl px-5 py-4 break-all select-all"
						>
							{passphrase}
						</div>
						<button
							class="btn preset-tonal-primary mt-3 w-full"
							onclick={copyPassphrase}
						>
							{copied ? "✓ Copied!" : "Copy to clipboard"}
						</button>
					</div>

					{#if completeError}
						<div
							class="text-error-500 text-sm p-3 bg-error-50 rounded-lg"
						>
							{completeError}
						</div>
					{/if}

					<label class="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							class="checkbox mt-0.5 shrink-0"
							bind:checked={savedChecked}
						/>
						<span class="text-sm leading-snug">
							I have saved this passphrase in a safe place and
							understand I cannot recover it without resetting my
							account again.
						</span>
					</label>

					<button
						class="btn preset-filled-primary-500 w-full"
						disabled={!savedChecked || completeLoading}
						onclick={complete}
					>
						{completeLoading
							? "Finishing…"
							: "Finish — take me to the app"}
					</button>
				</div>
			</Steps.Content>
		</Steps>
	</div>
</div>
