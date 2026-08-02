/**
 * Native printing of PDF bytes, without writing anything to disk.
 *
 * `window.print()` on the page would print the app's DOM — chrome, canvas
 * bitmaps, split markers — which is useless. Instead the bytes go into a blob
 * URL that a hidden `<iframe>` loads, and we call `print()` on that frame. The
 * browser hands the frame to its built-in PDF viewer, so the OS print dialog
 * receives the *PDF*: vector text, real per-page sizes, no app chrome. It is
 * the same code path as printing a local `.pdf`, so the user gets the same
 * native dialog (printer/destination, page ranges, copies, layout, color).
 */

/**
 * The print dialog is modal and reads the blob lazily, so the URL and frame
 * must outlive the `print()` call. Revoking too early can leave the job
 * without data; a generous delay is cheaper than a blank page.
 */
const CLEANUP_DELAY_MS = 60_000;

/** Give up if the frame never loads, rather than leaking it forever. */
const LOAD_TIMEOUT_MS = 30_000;

/**
 * Load `bytes` into a hidden frame and open the browser's native print dialog.
 *
 * `title` names the print job — and so pre-fills the filename when the chosen
 * destination is "Save as PDF". Physical printers ignore it.
 *
 * Resolves once the dialog has been handed off — not when printing finishes,
 * since the browser gives no reliable signal for that. Rejects if the frame
 * fails to load or the browser refuses to print.
 */
export function printPdfBytes(
	bytes: Uint8Array,
	options: { title?: string } = {},
): Promise<void> {
	const blob = new Blob([bytes], { type: "application/pdf" });
	const url = URL.createObjectURL(blob);

	const iframe = document.createElement("iframe");
	// Parked off-screen at 1×1 instead of `display: none`: a non-rendered frame
	// may never instantiate the PDF viewer, and printing it then yields a blank
	// page.
	iframe.setAttribute("aria-hidden", "true");
	iframe.setAttribute("tabindex", "-1");
	iframe.style.cssText =
		"position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";

	// The browser names the print job from the *top-level* document title —
	// not from the printed frame, and not from the blob URL — so swapping it
	// around the print call is what controls the "Save as PDF" filename.
	const previousTitle = document.title;
	let titleRestored = options.title === undefined;
	function restoreTitle() {
		if (titleRestored) return;
		titleRestored = true;
		document.title = previousTitle;
	}

	let cleanedUp = false;
	function cleanup() {
		if (cleanedUp) return;
		cleanedUp = true;
		// Backstop in case no afterprint arrives, so the tab title can't stick.
		restoreTitle();
		iframe.remove();
		URL.revokeObjectURL(url);
	}

	return new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error("The document took too long to prepare."));
		}, LOAD_TIMEOUT_MS);

		iframe.onload = () => {
			clearTimeout(timeout);
			try {
				const frame = iframe.contentWindow;
				if (!frame) throw new Error("Couldn't open the print preview.");

				if (options.title !== undefined) document.title = options.title;
				// afterprint lands on the printed frame in some browsers and on
				// the top window in others; first one to fire wins, and the
				// frame's plugin document may never fire at all.
				window.addEventListener("afterprint", restoreTitle, {
					once: true,
				});
				try {
					frame.addEventListener("afterprint", restoreTitle, {
						once: true,
					});
				} catch {
					/* frame not listenable — window + cleanup still cover it */
				}

				// Focus first: some browsers print the top window instead of
				// the frame when the frame isn't the active one.
				frame.focus();
				frame.print();
			} catch (err) {
				cleanup();
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			setTimeout(cleanup, CLEANUP_DELAY_MS);
			resolve();
		};

		iframe.onerror = () => {
			clearTimeout(timeout);
			cleanup();
			reject(new Error("Couldn't load the document for printing."));
		};

		iframe.src = url;
		document.body.appendChild(iframe);
	});
}
