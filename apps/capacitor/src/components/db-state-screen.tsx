import { Button } from "@lesefluss/ui/button";
import { AppWindow, CircleAlert, CirclePause, LoaderCircle } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

export type DbScreenState = "opening" | "in-use" | "moved" | "unavailable";

const OPENING_DOTS = 5;
const OPENING_DOT_MS = 1000;

const UNAVAILABLE_STEPS = [
	{
		title: "Open Lesefluss in a normal window",
		detail: "Some private windows don't allow site storage.",
	},
	{
		title: "Allow site data for Lesefluss",
		detail: "Look under the browser's privacy or cookie settings.",
	},
	{
		title: "Free some space on this device",
		detail: "Storage is refused when the disk is nearly full.",
	},
];

interface Props {
	state: DbScreenState;
	onAction?: () => void;
	busy?: boolean;
	/** The user's last try failed the same way; the note says so in place of its usual text. */
	failedAgain?: boolean;
}

/** The full page shown instead of the app while the library can't be used in this tab. */
export const DbStateScreen: React.FC<Props> = ({
	state,
	onAction,
	busy = false,
	failedAgain = false,
}) => (
	<main className="flex min-h-dvh flex-col bg-background px-6 py-6 text-foreground">
		<div className="flex items-center gap-2">
			<img
				src={`${import.meta.env.BASE_URL}logo.svg`}
				alt=""
				width={28}
				height={28}
				className="size-7"
			/>
			<span className="font-semibold text-base">Lesefluss</span>
		</div>
		<div className="flex flex-1 items-center justify-center py-8">
			<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
				{state === "opening" && <Opening />}
				{state === "in-use" && (
					<Message
						icon={<AppWindow aria-hidden="true" className="size-7" />}
						title="Lesefluss is open in another tab"
						body="Your library can be open in one tab at a time. Use it here and the other tab pauses, with your reading position saved."
						action="Use it here"
						note={
							failedAgain ? "Still in use in the other tab." : "Or switch back to the other tab."
						}
						onAction={onAction}
						busy={busy}
					/>
				)}
				{state === "moved" && (
					<Message
						icon={<CirclePause aria-hidden="true" className="size-7" />}
						title="Lesefluss is now open in another tab"
						body="This tab paused so your library stays safe. Your reading position was saved before it let go."
						action="Use it here again"
						note="The other tab pauses if you do."
						onAction={onAction}
						busy={busy}
					/>
				)}
				{state === "unavailable" && (
					<Unavailable onAction={onAction} busy={busy} failedAgain={failedAgain} />
				)}
			</div>
		</div>
	</main>
);

const Glyph: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
		{children}
	</div>
);

const Message: React.FC<{
	icon: React.ReactNode;
	title: string;
	body: string;
	action: string;
	note: string;
	onAction?: () => void;
	busy: boolean;
}> = ({ icon, title, body, action, note, onAction, busy }) => (
	<>
		<Glyph>{icon}</Glyph>
		<h1 className="m-0 text-balance font-semibold text-xl">{title}</h1>
		<p className="m-0 text-foreground/80 leading-relaxed">{body}</p>
		<Button className="mt-2 min-h-11 min-w-44" onClick={onAction} disabled={busy}>
			{busy ? "One moment…" : action}
		</Button>
		<p className="m-0 text-muted-foreground text-sm" role="status">
			{note}
		</p>
	</>
);

const Opening: React.FC = () => {
	const [filled, setFilled] = useState(1);
	useEffect(() => {
		const timer = setInterval(
			() => setFilled((n) => Math.min(n + 1, OPENING_DOTS)),
			OPENING_DOT_MS,
		);
		return () => clearInterval(timer);
	}, []);
	return (
		<>
			<Glyph>
				<LoaderCircle aria-hidden="true" className="size-7 motion-safe:animate-spin" />
			</Glyph>
			<h1 className="m-0 text-balance font-semibold text-xl" role="status">
				Opening your library…
			</h1>
			<p className="m-0 text-foreground/80 leading-relaxed">
				The page you just left is still closing. This takes a moment.
			</p>
			<div className="flex gap-2" aria-hidden="true">
				{Array.from({ length: OPENING_DOTS }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of dots
						key={i}
						className={`size-2 rounded-full ${i < filled ? "bg-primary" : "bg-muted"}`}
					/>
				))}
			</div>
		</>
	);
};

const Unavailable: React.FC<{ onAction?: () => void; busy: boolean; failedAgain: boolean }> = ({
	onAction,
	busy,
	failedAgain,
}) => (
	<>
		<Glyph>
			<CircleAlert aria-hidden="true" className="size-7" />
		</Glyph>
		<h1 className="m-0 text-balance font-semibold text-xl">This window can't keep your library</h1>
		<p className="m-0 text-foreground/80 leading-relaxed">
			Lesefluss stores your books on this device, and this browser window doesn't allow that.
		</p>
		<ol className="m-0 flex w-full list-none flex-col gap-3 p-0 text-left">
			{UNAVAILABLE_STEPS.map((step, i) => (
				<li key={step.title} className="flex gap-3 rounded-lg border border-border p-3">
					<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-sm">
						{i + 1}
					</span>
					<span className="flex flex-col gap-1">
						<span className="font-medium">{step.title}</span>
						<span className="text-muted-foreground text-sm">{step.detail}</span>
					</span>
				</li>
			))}
		</ol>
		<Button className="mt-2 min-h-11 min-w-44" onClick={onAction} disabled={busy}>
			{busy ? "Trying…" : "Try again"}
		</Button>
		<p className="m-0 text-muted-foreground text-sm" role="status">
			{failedAgain
				? "Still not possible in this window."
				: "Signed in? Your library is safe on the server."}
		</p>
	</>
);
