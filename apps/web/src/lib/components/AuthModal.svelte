<script lang="ts">
	import { Dialog, Tabs, Portal } from "@skeletonlabs/skeleton-svelte";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import { apiFetch } from "$lib/services/api.js";
	import type { AuthUser } from "$lib/types.js";
	import { resolve } from "$app/paths";
	import { Steps } from "@skeletonlabs/skeleton-svelte";

	interface Props {
		open: boolean;
		onOpenChange: (details: { open: boolean }) => void;
		onAuthSuccess: () => void;
	}

	let { open, onOpenChange, onAuthSuccess }: Props = $props();

	const auth = getAuth();

	// --- Login state ---
	let loginEmail = $state("");
	let loginPassphrase = $state("");

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		try {
			await auth.login(loginEmail, loginPassphrase);
			onAuthSuccess();
		} catch {
			// error displayed via auth.error
		}
	}

	// --- Signup state ---
	let signupStep = $state(0);
	let signupEmail = $state("");
	let emailError = $state<string | null>(null);
	let emailLoading = $state(false);

	let otp = $state("");
	let otpError = $state<string | null>(null);
	let otpLoading = $state(false);

	let passphrase = $state("");
	let verifiedToken = $state("");
	let copied = $state(false);
	let savedChecked = $state(false);
	let completeLoading = $state(false);
	let completeError = $state<string | null>(null);

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		emailError = null;
		emailLoading = true;
		try {
			await apiFetch("/auth/signup/init", {
				method: "POST",
				body: JSON.stringify({ email: signupEmail }),
			});
			signupStep = 1;
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
			}>("/auth/signup/verify-otp", {
				method: "POST",
				body: JSON.stringify({ email: signupEmail, otp }),
			});
			verifiedToken = res.verifiedToken;
			passphrase = res.passphrase;
			signupStep = 2;
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

	async function completeSignup() {
		completeError = null;
		completeLoading = true;
		try {
			await apiFetch<{ user: AuthUser }>("/auth/signup/complete", {
				method: "POST",
				body: JSON.stringify({ verifiedToken }),
			});
			await auth.initAuth();
			onAuthSuccess();
		} catch (err) {
			completeError =
				err instanceof Error
					? err.message
					: "Failed to complete signup";
		} finally {
			completeLoading = false;
		}
	}

	const stepTitles = ["Your email", "Verify email", "Your passphrase"];
</script>

<Dialog
	{open}
	{onOpenChange}
	closeOnInteractOutside={false}
	closeOnEscape={true}
>
	<Portal>
		<Dialog.Backdrop class="bg-black/50 fixed inset-0 z-50" />
		<Dialog.Positioner
			class="fixed inset-0 flex items-center justify-center z-50"
		>
			<Dialog.Content
				class="card preset-outlined-surface-200 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface-50-950 rounded-xl"
			>
				<div class="flex items-center justify-between mb-4">
					<Dialog.Title class="text-xl font-bold"
						>Sign in to download</Dialog.Title
					>
					<Dialog.CloseTrigger>
						<button
							class="btn-icon preset-tonal-surface"
							aria-label="Close">&times;</button
						>
					</Dialog.CloseTrigger>
				</div>

				<Tabs defaultValue="login">
					<Tabs.List class="mb-6">
						<Tabs.Trigger value="login" class="flex-1"
							>Log In</Tabs.Trigger
						>
						<Tabs.Trigger value="signup" class="flex-1"
							>Sign Up</Tabs.Trigger
						>
						<Tabs.Indicator />
					</Tabs.List>

					<!-- Login Tab -->
					<Tabs.Content value="login">
						{#if auth.error}
							<div
								class="text-error-500 text-sm text-center p-3 bg-error-50 rounded-lg mb-4"
							>
								{auth.error}
							</div>
						{/if}

						<form onsubmit={handleLogin} class="space-y-4">
							<label class="block space-y-1">
								<span class="text-sm font-medium">Email</span>
								<input
									type="email"
									class="input"
									bind:value={loginEmail}
									required
									autocomplete="email"
									placeholder="you@example.com"
								/>
							</label>

							<label class="block space-y-1">
								<span class="text-sm font-medium"
									>Passphrase</span
								>
								<input
									type="password"
									class="input font-mono"
									bind:value={loginPassphrase}
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

						<p class="text-sm text-center mt-4">
							<a
								href={resolve("/reset-password")}
								class="underline">Forgot your passphrase?</a
							>
						</p>
					</Tabs.Content>

					<!-- Signup Tab -->
					<Tabs.Content value="signup">
						<Steps
							step={signupStep}
							count={3}
							linear
							class="w-full"
						>
							<Steps.List class="mb-6">
								{#each stepTitles as title, index (title)}
									<Steps.Item {index} class="flex-1">
										<Steps.Trigger
											class="flex flex-col items-center gap-1 w-full"
										>
											<Steps.Indicator
												class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
												{signupStep > index
													? 'preset-filled-success-500'
													: signupStep === index
														? 'preset-filled-primary-500'
														: 'preset-outlined-surface-500'}"
											>
												{#if signupStep > index}
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
												class="h-px bg-surface-300 flex-1 mt-3"
											/>
										{/if}
									</Steps.Item>
								{/each}
							</Steps.List>

							<!-- Step 0: Email -->
							<Steps.Content index={0}>
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
											bind:value={signupEmail}
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
							</Steps.Content>

							<!-- Step 1: OTP -->
							<Steps.Content index={1}>
								<p class="text-sm text-surface-500 mb-4">
									Enter the 6-digit code sent to <strong
										>{signupEmail}</strong
									>.
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
										disabled={otpLoading ||
											otp.length !== 6}
									>
										{otpLoading
											? "Verifying…"
											: "Verify code"}
									</button>
								</form>

								<p
									class="text-xs text-surface-500 mt-4 text-center"
								>
									Didn't receive it?
									<button
										class="underline"
										onclick={() => {
											signupStep = 0;
											otp = "";
											otpError = null;
										}}
									>
										Go back and resend
									</button>
								</p>
							</Steps.Content>

							<!-- Step 2: Passphrase handover -->
							<Steps.Content index={2}>
								<div class="space-y-4">
									<p class="text-sm text-surface-500">
										Save this passphrase — you'll need it to
										log in. This is the only time you'll see
										it.
									</p>

									<div class="relative">
										<div
											class="font-mono text-base font-semibold tracking-wide bg-surface-100-800 border border-surface-300 rounded-xl px-4 py-3 break-all select-all"
										>
											{passphrase}
										</div>
										<button
											class="btn preset-tonal-primary mt-2 w-full"
											onclick={copyPassphrase}
										>
											{copied
												? "✓ Copied!"
												: "Copy to clipboard"}
										</button>
									</div>

									{#if completeError}
										<div
											class="text-error-500 text-sm p-3 bg-error-50 rounded-lg"
										>
											{completeError}
										</div>
									{/if}

									<label
										class="flex items-start gap-3 cursor-pointer"
									>
										<input
											type="checkbox"
											class="checkbox mt-0.5 shrink-0"
											bind:checked={savedChecked}
										/>
										<span class="text-sm leading-snug">
											I have saved this passphrase in a
											safe place.
										</span>
									</label>

									<button
										class="btn preset-filled-primary-500 w-full"
										disabled={!savedChecked ||
											completeLoading}
										onclick={completeSignup}
									>
										{completeLoading
											? "Finishing…"
											: "Complete signup"}
									</button>
								</div>
							</Steps.Content>
						</Steps>
					</Tabs.Content>
				</Tabs>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
