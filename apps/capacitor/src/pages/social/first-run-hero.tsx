import type { OwnSocialProfile, SocialRelationships } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Link2 } from "lucide-react";
import type React from "react";
import { BuddyReadTrailer } from "@/components/social/buddy-read-trailer";
import { CoverBackdrop } from "@/components/social/cover-backdrop";
import { PasteInviteField } from "@/components/social/paste-invite-field";
import { useCurrentBook } from "@/components/social/social-ui";

const STEPS = [
	{
		title: "Send your invite link",
		body: "There's no public search. Only people you invite can find you.",
	},
	{
		title: "Pick a book together",
		body: "Everyone reads their own copy, in the mode they like. Set a finish date if you want one.",
	},
	{
		title: "Watch the track move",
		body: "Progress, reactions and chapter notes, without spoilers past where you are.",
	},
];

/** The trailer on a cover-lit card: what social reading looks like before there is anyone to read with. */
export function TrailerCard({
	self,
	isDemoBook = false,
	children,
}: {
	self?: { name: string; avatarUrl: string | null };
	isDemoBook?: boolean;
	children: React.ReactNode;
}) {
	const currentBook = useCurrentBook();
	const book = isDemoBook ? null : currentBook;
	return (
		<section className="relative mt-4 overflow-hidden rounded-3xl border border-border bg-card text-card-foreground">
			<CoverBackdrop src={book?.coverSrc ?? null} />
			<div className="relative p-4">
				<div className="rounded-2xl border border-border bg-card/80 p-3">
					<BuddyReadTrailer self={self} isDemoBook={isDemoBook} />
				</div>
				{children}
			</div>
		</section>
	);
}

/** The whole tab for someone without friends yet: one invitation instead of three empty sections. */
export function FirstRunHero({
	me,
	outgoing,
	isBusy,
	onCancel,
}: {
	me: OwnSocialProfile | undefined;
	outgoing: SocialRelationships["outgoing"];
	isBusy: boolean;
	onCancel: (requestId: string) => void;
}) {
	return (
		<>
			<TrailerCard self={me ? { name: me.name, avatarUrl: me.avatarUrl } : undefined}>
				<h2 className="m-0 mt-6 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Read together, wherever you are.
				</h2>
				<p className="m-0 mt-3 text-muted-foreground text-sm leading-relaxed">
					Pick a book with a friend and watch each other move through it. React to chapters, leave
					notes, keep each other going.
				</p>

				{outgoing.length > 0 && (
					<ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
						{outgoing.map((r) => (
							<li
								key={r.requestId}
								className="flex items-center gap-2 rounded-xl bg-primary/10 py-1 pr-1 pl-3"
							>
								<SocialAvatar name={r.name} avatarUrl={r.avatarUrl} size="sm" />
								<span className="min-w-0 flex-1 truncate text-sm">
									<span className="font-semibold">{r.name}</span>
									<span className="text-muted-foreground"> hasn't accepted yet</span>
								</span>
								<Button
									size="sm"
									variant="ghost"
									disabled={isBusy}
									onClick={() => onCancel(r.requestId)}
								>
									Cancel
								</Button>
							</li>
						))}
					</ul>
				)}

				<Button asChild className="mt-6 w-full md:mx-auto md:flex md:w-fit">
					<Link to="/tabs/social/invite-link">
						<Link2 /> Invite a friend
					</Link>
				</Button>
				<p className="m-0 mt-4 text-muted-foreground text-xs">Got an invite link from someone?</p>
				<PasteInviteField className="mt-2" />
				{me && (
					<Link
						to="/tabs/social/profile/$userId"
						params={{ userId: me.userId }}
						className="mt-4 flex items-center gap-1 text-muted-foreground text-xs no-underline"
					>
						@{me.handle} · Your profile
						<ChevronRight className="size-3.5" />
					</Link>
				)}
			</TrailerCard>

			<HowItWorks />
		</>
	);
}

export function HowItWorks() {
	return (
		<section className="mt-8">
			<h3 className="m-0 font-semibold text-2xs text-muted-foreground uppercase tracking-widest">
				How it works
			</h3>
			<ol className="m-0 mt-4 flex list-none flex-col gap-4 p-0">
				{STEPS.map((step, i) => (
					<li key={step.title} className="flex gap-3">
						<span className="w-5 font-semibold text-2xl text-primary tabular-nums leading-none">
							{i + 1}
						</span>
						<div>
							<div className="font-semibold text-base text-foreground">{step.title}</div>
							<div className="mt-0.5 text-muted-foreground text-sm leading-snug">{step.body}</div>
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}
