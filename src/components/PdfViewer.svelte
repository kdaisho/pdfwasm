<script lang="ts">
    import type { PageData, SearchMatch } from "../types";
    import { findMatches } from "../services/search";
    import PdfPage from "./PdfPage.svelte";
    import SearchBar from "./SearchBar.svelte";

    interface Props {
        pages: PageData[];
    }

    let { pages }: Props = $props();

    let query = $state("");
    let debouncedQuery = $state("");
    let caseSensitive = $state(false);
    let wholeWord = $state(false);
    let currentMatchIndex = $state(-1);

    let searchInput: HTMLInputElement | undefined = $state();
    let pageElements = new Map<number, HTMLDivElement>();

    $effect(() => {
        const q = query;
        if (q === "") {
            debouncedQuery = "";
            return;
        }
        const timer = setTimeout(() => {
            debouncedQuery = q;
        }, 250);
        return () => clearTimeout(timer);
    });

    let matches: SearchMatch[] = $derived(
        findMatches(pages, debouncedQuery, { caseSensitive, wholeWord })
    );

    // Reset to first match when results change
    $effect(() => {
        // Access reactive deps
        matches.length;
        debouncedQuery;
        caseSensitive;
        wholeWord;
        currentMatchIndex = matches.length > 0 ? 0 : -1;
    });

    // Scroll active match into view
    $effect(() => {
        if (currentMatchIndex < 0 || matches.length === 0) return;
        const match = matches[currentMatchIndex];
        const pageEl = pageElements.get(match.pageIndex);
        if (!pageEl) return;

        const page = pages.find(p => p.index === match.pageIndex);
        if (!page) return;
        const char = page.chars[match.charIndex];
        if (!char) {
            pageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
        }
        const charYInPage = (page.originalHeight - char.top) * page.scale;
        const pageRect = pageEl.getBoundingClientRect();
        const targetY =
            window.scrollY +
            pageRect.top +
            charYInPage -
            window.innerHeight / 2;
        window.scrollTo({ top: targetY, behavior: "smooth" });
    });

    function goToNext() {
        const n = matches.length;
        if (n === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % n;
    }

    function goToPrev() {
        const n = matches.length;
        if (n === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + n) % n;
    }

    function handleKeyDown(e: KeyboardEvent) {
        console.log("==>", 100);
        if (e.metaKey && !e.altKey && !e.shiftKey && e.code === "KeyF") {
            console.log("==>", 101);
            e.preventDefault();
            searchInput?.focus();
            searchInput?.select();
            return;
        }

        if (e.metaKey && !e.altKey && e.code === "KeyG") {
            console.log("==>", 200);
            e.preventDefault();
            const n = matches.length;
            if (n === 0) return;
            if (e.shiftKey) {
                currentMatchIndex = (currentMatchIndex - 1 + n) % n;
            } else {
                currentMatchIndex = (currentMatchIndex + 1) % n;
            }
            return;
        }

        if (!e.metaKey || !e.altKey) return;
        if (e.code === "KeyW") {
            e.preventDefault();
            wholeWord = !wholeWord;
        } else if (e.code === "KeyC") {
            e.preventDefault();
            caseSensitive = !caseSensitive;
        }

        console.log("==>", 300);
    }

    function trackPageRef(node: HTMLDivElement, pageIndex: number) {
        pageElements.set(pageIndex, node);
        return {
            destroy() {
                pageElements.delete(pageIndex);
            }
        };
    }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div>
    <SearchBar
        bind:inputElement={searchInput}
        {query}
        onchange={q => {
            query = q;
        }}
        matchCount={matches.length}
        {currentMatchIndex}
        onnext={goToNext}
        onprev={goToPrev}
        {caseSensitive}
        {wholeWord}
        ontogglecasesensitive={() => {
            caseSensitive = !caseSensitive;
        }}
        ontogglewholeword={() => {
            wholeWord = !wholeWord;
        }}
    />
    <div class="pages-container">
        {#each pages as page (page.index)}
            {@const pageMatches = matches.filter(
                m => m.pageIndex === page.index
            )}
            {@const activeCharIndex =
                currentMatchIndex >= 0 &&
                matches[currentMatchIndex]?.pageIndex === page.index
                    ? matches[currentMatchIndex].charIndex
                    : -1}
            <div use:trackPageRef={page.index}>
                <PdfPage {page} matches={pageMatches} {activeCharIndex} />
            </div>
        {/each}
    </div>
</div>

<style>
    .pages-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 16px;
        overflow-x: auto;
    }
</style>
