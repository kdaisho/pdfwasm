import { createToaster } from "@skeletonlabs/skeleton-svelte";

// Shared toaster instance. Import this anywhere to surface transient feedback
// (errors, notices) instead of crowding the edit-mode action bar. The matching
// <Toaster /> renderer is mounted once in the root layout.
//
// top-end keeps toasts clear of the centered action bar and page content.
export const toaster = createToaster({
	placement: "top-end",
	duration: 26000,
});
