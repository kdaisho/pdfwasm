<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import EmailCodeSignIn from "$lib/components/EmailCodeSignIn.svelte";
	import PasskeySignIn from "$lib/components/PasskeySignIn.svelte";

	function goHome() {
		goto(resolve("/"), { invalidateAll: true });
	}
</script>

<div class="flex items-center justify-center min-h-screen px-4">
	<div class="w-full max-w-sm space-y-6 p-8">
		<h1 class="text-2xl font-bold text-center">Log In</h1>

		<EmailCodeSignIn onSuccess={goHome} />

		<PasskeySignIn autofill onSuccess={goHome} />

		<p class="text-sm text-center">
			Don't have an account?
			<a href={resolve("/signup")} class="underline">Sign up</a>
		</p>
	</div>
</div>
