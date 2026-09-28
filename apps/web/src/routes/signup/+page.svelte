<script lang="ts">
	import { beforeNavigate, goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { onMount } from "svelte";
	import { Steps } from "@skeletonlabs/skeleton-svelte";
	import StepIndicator from "$lib/components/StepIndicator.svelte";
	import { apiFetch } from "$lib/services/api.js";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	const auth = getAuth();

	// Step state
	let step = $state(0);

	// Step 1 – email
	let email = $state("");
	let emailError = $state<string | null>(null);
	let emailLoading = $state(false);

	// Step 2 – OTP
	let otp = $state("");
	let otpError = $state<string | null>(null);
	let otpLoading = $state(false);

	const STORAGE_KEY = "signup_state";

	function persistState() {
		try {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					step,
					email,
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
			// Drop persisted state after 10 min, matching the OTP server-side TTL —
			// keeps a stale verify screen from lingering longer than the code is
			// useful.
			if (Date.now() - saved.savedAt > 10 * 60 * 1000) {
				sessionStorage.removeItem(STORAGE_KEY);
				return;
			}
			if (saved.step !== 1) {
				sessionStorage.removeItem(STORAGE_KEY);
				return;
			}
			step = saved.step;
			email = saved.email;
		} catch {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	});

	beforeNavigate(({ to }) => {
		if (to && to.url.pathname !== "/signup")
			sessionStorage.removeItem(STORAGE_KEY);
	});

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		emailError = null;
		emailLoading = true;
		try {
			await apiFetch("/auth/signup/init", {
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
			await apiFetch("/auth/signup/verify-otp", {
				method: "POST",
				body: JSON.stringify({ email, otp }),
			});
			await auth.initAuth();
			sessionStorage.removeItem(STORAGE_KEY);
			goto(resolve("/"), { invalidateAll: true });
		} catch (err) {
			otpError =
				err instanceof Error ? err.message : "Verification failed";
		} finally {
			otpLoading = false;
		}
	}

	const stepTitles = ["Your email", "Verify email"];
</script>

<div class="flex items-center justify-center min-h-screen px-4 py-12">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold">Create account</h1>
			<p class="mt-2 text-sm text-surface-500">
				Already have an account?
				<a href={resolve("/login")} class="underline">Log in</a>
			</p>
		</div>

		<Steps {step} count={2} linear class="w-full">
			<StepIndicator {step} titles={stepTitles} />

			<!-- Step 0: Email -->
			<Steps.Content index={0}>
				<div class="card preset-outlined-surface-200 p-6 rounded-xl">
					<h2 class="text-xl font-semibold mb-1">Enter your email</h2>
					<p class="text-sm text-surface-500 mb-6">
						We'll send a 6-digit code to verify it's you.
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
							{otpLoading
								? "Creating account…"
								: "Create account"}
						</button>
					</form>

					<p class="text-xs text-surface-500 mt-6 text-center">
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

					<p class="text-xs text-surface-500 mt-3 text-center">
						Already have an account? You won't get a code —
						<a href={resolve("/login")} class="underline">log in</a>
						instead.
					</p>
				</div>
			</Steps.Content>
		</Steps>
	</div>
</div>
