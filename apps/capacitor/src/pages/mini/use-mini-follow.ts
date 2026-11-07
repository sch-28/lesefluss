import type { RsvpSettings } from "@lesefluss/core";
import { useEffect, useRef, useState } from "react";
import { createFollower, type Follower, type MiniStart } from "./mini-bridge";
import {
	currentMiniSession,
	endMiniSession,
	type MiniSession,
	markMiniStopped,
	useMiniSession,
} from "./open-mini";

type Options = {
	bookId: string;
	getStart: (host: MiniSession["host"]) => MiniStart | null;
	/** Where the reader stands as it leaves the book: what the mini stops at. */
	getStopWord: () => number;
	onShown: (word: number) => void;
	onSave: (word: number, isPlaying: boolean) => void;
	onWpm: (wpm: number) => void;
	settings: RsvpSettings;
	focalColor: string;
};

export type MiniFollow = {
	isAttached: boolean;
	isPlaying: boolean;
	/** The reader moved on its own: the mini pauses there. */
	takeover: (word: number) => void;
	isPlayingNow: () => boolean;
};

/** The reader's side of a mini window open on its book. */
export function useMiniFollow(options: Options): MiniFollow {
	const session = useMiniSession();
	const mine = session && session.bookId === options.bookId && !session.isStopped ? session : null;
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const followerRef = useRef<Follower | null>(null);
	const [isPlaying, setPlaying] = useState(false);

	useEffect(() => {
		if (!mine) return;
		const follower = createFollower(mine.main, {
			getStart: () => optionsRef.current.getStart(mine.host),
			onShown: (word) => optionsRef.current.onShown(word),
			onSave: (word, playing) => {
				setPlaying(playing);
				optionsRef.current.onSave(word, playing);
			},
			onWpm: (wpm) => optionsRef.current.onWpm(wpm),
			onClosed: () => endMiniSession(mine.id),
		});
		followerRef.current = follower;
		return () => {
			followerRef.current = null;
			setPlaying(false);
			if (currentMiniSession()?.id === mine.id) {
				// The reader leaves the book; its own unmount flush saves the word.
				follower.stop(optionsRef.current.getStopWord());
				markMiniStopped(mine.id);
			} else {
				// The window went away with a word shown after its last report.
				const unsaved = follower.unsavedWord();
				if (unsaved !== null) optionsRef.current.onSave(unsaved, false);
			}
			follower.detach();
		};
	}, [mine]);

	const { settings, focalColor } = options;
	useEffect(() => {
		followerRef.current?.sendSettings(settings, focalColor);
	}, [settings, focalColor]);

	const [takeover] = useState(() => (word: number) => {
		const follower = followerRef.current;
		if (!follower) return;
		follower.takeover(word);
		setPlaying(false);
	});
	const [isPlayingNow] = useState(() => () => followerRef.current?.isPlaying() ?? false);
	return { isAttached: mine !== null, isPlaying, takeover, isPlayingNow };
}
