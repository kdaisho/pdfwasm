<script lang="ts">
	import { Toast } from "@skeletonlabs/skeleton-svelte";
	import { toaster } from "$lib/stores/toaster";
</script>

<!-- Mount once (root layout). Styling lives in app.css under [data-scope='toast'];
     data-type (success/warning/error) drives the themed presets automatically. -->
<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				{#if toast.description}
					<Toast.Description>{toast.description}</Toast.Description>
				{/if}
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>
