import {
	createLongMoveDetector,
	createReadingResumeDetector,
	type ReadingStreak,
} from "./browse-detector";

export type BrowseSession = {
	end(): void;
	discard(): void;
	rewind(pos: number): void;
	backfill(span: { from: number; to: number; activeMs: number }): void;
};

export type BrowseControllerOpts = {
	getLastWord: () => number | null;
	getPersistedWord: () => number | null;
	isRsvp: () => boolean;
	writePosition: (word: number) => void;
	showUnsavedMove: (word: number) => void;
	getSession: () => BrowseSession | null;
	onAnchorChange: (anchor: number | null) => void;
	notifyAutoCommit: (word: number, undo: () => void) => void;
	now?: () => number;
};

/**
 * Browse mode's state machine, framework-free so it is unit-testable
 * (`useBrowseMode` wraps it). While browsing, the anchor is the committed
 * position: the view may move, but nothing is persisted until the user goes
 * back, reads from the new spot, or settles into reading there.
 */
export class BrowseController {
	private anchorWord: number | null = null;
	private readonly longMove = createLongMoveDetector();
	private readonly resume = createReadingResumeDetector();
	private resumedStreak: ReadingStreak | null = null;
	// Bumped on reset (book or chapter change): an undo offered for the previous
	// book must not write its anchor into the new one.
	private generation = 0;

	constructor(private readonly opts: BrowseControllerOpts) {}

	get anchor(): number | null {
		return this.anchorWord;
	}

	get isBrowsing(): boolean {
		return this.anchorWord !== null;
	}

	reset = (): void => {
		this.generation++;
		this.setAnchor(null);
		this.longMove.reset();
		this.resumedStreak = null;
	};

	private enter(anchor: number): void {
		if (this.isBrowsing) return;
		// Leaving while browsing resumes at the anchor, so it must be durable. It
		// can be ahead of the last save (scroll ticks) or behind saves made before
		// a fast scroll was recognised.
		if (anchor !== this.opts.getPersistedWord()) this.opts.writePosition(anchor);
		this.opts.getSession()?.rewind(anchor);
		this.resume.reset();
		this.setAnchor(anchor);
	}

	enterForJump = (target: number): void => {
		const from = this.opts.getLastWord();
		if (from !== null && target !== from) this.enter(from);
	};

	start = (): void => {
		const word = this.opts.getLastWord();
		if (word !== null) this.enter(word);
	};

	back = (): void => {
		const anchor = this.anchorWord;
		if (anchor === null) return;
		this.setAnchor(null);
		this.longMove.reset();
		this.opts.showUnsavedMove(anchor);
	};

	readFromHere = (): void => {
		const anchor = this.anchorWord;
		if (anchor === null) return;
		const word = this.opts.getLastWord() ?? anchor;
		// The tracker is paused while browsing, so ending the sitting makes the
		// resume open a fresh one here. Unmoved, it simply carries on.
		if (word !== anchor) this.opts.getSession()?.end();
		this.setAnchor(null);
		this.longMove.reset();
		if (word !== anchor) this.opts.writePosition(word);
	};

	/** Feeds a scroll/page settle. Returns true when reading has resumed at the
	 *  browsed spot: call `autoCommit` once the settle is applied. */
	recordSettle = (from: number, to: number): boolean => {
		const now = this.now();
		if (!this.isBrowsing) {
			const anchor = this.longMove.record(from, to, now);
			if (anchor !== null) this.enter(anchor);
		}
		if (!this.isBrowsing) return false;
		this.resumedStreak = this.resume.record(from, to, now);
		return this.resumedStreak !== null;
	};

	autoCommit = (): void => {
		const anchor = this.anchorWord;
		const word = this.opts.getLastWord();
		const streak = this.resumedStreak;
		this.resumedStreak = null;
		if (anchor === null || word === null) return;
		this.readFromHere();
		if (word === anchor) return;
		if (streak) {
			this.opts.getSession()?.backfill({ from: streak.from, to: word, activeMs: streak.activeMs });
		}
		const generation = this.generation;
		this.opts.notifyAutoCommit(word, () => {
			if (generation === this.generation) this.undoAutoCommit(anchor);
		});
	};

	/** A device position update while browsing moves the anchor, not the view.
	 *  Returns true when it was handled that way. */
	onDevicePosition = (word: number): boolean => {
		if (!this.isBrowsing) return false;
		this.setAnchor(word);
		return true;
	};

	private undoAutoCommit(anchor: number): void {
		if (this.opts.isRsvp() || this.isBrowsing) return;
		// The backfilled sitting covers a spot the user just disowned; persisting
		// it would count it as read and unlock buddy-read spoilers up to it.
		this.opts.getSession()?.discard();
		this.opts.writePosition(anchor);
		this.longMove.reset();
		this.opts.showUnsavedMove(anchor);
	}

	private setAnchor(word: number | null): void {
		this.anchorWord = word;
		this.opts.onAnchorChange(word);
	}

	private now(): number {
		return this.opts.now?.() ?? performance.now();
	}
}
