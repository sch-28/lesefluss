import type { SaveSource } from "../../../test-hooks/reader";
import { firstLineRect, lastLineRect } from "../line-rects";
import type { ReaderApi, ReaderMode, UserNavigateSource, WordRange } from "./types";

type NavigateListener = (word: number, source: UserNavigateSource) => void;

const IS_USER_INTENT: { [S in SaveSource]: S extends UserNavigateSource ? true : false } = {
	settle: true,
	jump: true,
	"word-tap": true,
	scrub: true,
	browse: true,
	rsvp: true,
	"rsvp-exit": true,
	"read-aloud": true,
	recovered: false,
	"kept-local": false,
	adopted: false,
	unmount: false,
	pagehide: false,
};

function isUserNavigateSource(source: SaveSource): source is UserNavigateSource {
	return IS_USER_INTENT[source];
}

export type NavigateEmitter = {
	subscribe(cb: NavigateListener): () => void;
	emit(word: number, source: SaveSource): void;
};

export function createNavigateEmitter(): NavigateEmitter {
	const listeners = new Set<NavigateListener>();
	return {
		subscribe(cb) {
			listeners.add(cb);
			return () => {
				listeners.delete(cb);
			};
		},
		emit(word, source) {
			if (!isUserNavigateSource(source)) return;
			for (const cb of [...listeners]) {
				// A listener runs inside the save path, which must never fail.
				try {
					cb(word, source);
				} catch (err) {
					console.error("[reader-api] onUserNavigate listener threw", err);
				}
			}
		},
	};
}

/** A heading renders as one element that carries only its first word. */
const WORD_TARGETS = "span[data-word], [data-heading-word]";

function wordOf(el: HTMLElement): number | null {
	const word = Number.parseInt(el.dataset.word ?? el.dataset.headingWord ?? "", 10);
	return Number.isNaN(word) ? null : word;
}

/** Page mode's neighbouring pages extend past its clip into the side gutters, so only the clip counts there. */
function visibleRoot(view: Element): Element {
	return view.querySelector(".page-clip") ?? view;
}

function visibleWordsIn(view: Element): { first: number; last: number } | null {
	const root = visibleRoot(view);
	const box = root.getBoundingClientRect();
	const isOnScreen = (r: DOMRect) =>
		r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right;
	let first: number | null = null;
	let last: number | null = null;
	for (const span of root.querySelectorAll<HTMLElement>(WORD_TARGETS)) {
		const word = wordOf(span);
		if (word === null) continue;
		if (!isOnScreen(firstLineRect(span)) && !isOnScreen(lastLineRect(span))) continue;
		if (first === null || word < first) first = word;
		if (last === null || word > last) last = word;
	}
	return first === null || last === null ? null : { first, last };
}

function rectsForIn(view: Element, { start, end }: WordRange): DOMRect[] {
	const rects: DOMRect[] = [];
	for (const span of visibleRoot(view).querySelectorAll<HTMLElement>(WORD_TARGETS)) {
		const word = wordOf(span);
		if (word === null || word < start || word > end) continue;
		rects.push(...Array.from(span.getClientRects()));
	}
	return rects;
}

export type LegacyReaderDeps = {
	mode: ReaderMode;
	emitter: NavigateEmitter;
	getView(): Element | null;
	getCurrentWord(): number | null;
	navigateToWord(word: number): void;
};

export function createLegacyReaderApi(deps: LegacyReaderDeps): ReaderApi {
	return {
		mode: deps.mode,
		goToWord: (word) => deps.navigateToWord(word),
		currentWord: () => deps.getCurrentWord() ?? 0,
		visibleWords() {
			if (deps.mode === "rsvp") {
				const word = deps.getCurrentWord();
				return word === null ? null : { first: word, last: word };
			}
			const view = deps.getView();
			return view ? visibleWordsIn(view) : null;
		},
		rectsFor(range) {
			if (deps.mode === "rsvp") return [];
			const view = deps.getView();
			return view ? rectsForIn(view, range) : [];
		},
		onUserNavigate: (cb) => deps.emitter.subscribe(cb),
	};
}
