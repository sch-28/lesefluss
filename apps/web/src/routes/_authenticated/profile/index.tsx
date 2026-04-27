import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Globe, MessageSquare, Settings } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { getProfileStats } from "~/lib/profile";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/_authenticated/profile/")({
	loader: async ({ context }) => {
		const stats = await getProfileStats();
		return { user: context.session.user, ...stats };
	},
	head: () =>
		seo({
			title: "Profile - Lesefluss",
			isNoindex: true,
		}),
	component: ProfilePage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(ms: number): string {
	const diff = Date.now() - ms;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return new Date(ms).toLocaleDateString();
}

function formatWords(n: number): string {
	if (n < 1_000) return String(n);
	if (n < 1_000_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function formatMemberSince(date: Date | string): string {
	return new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function StatsSection({
	bookCount,
	highlightCount,
	glossaryCount,
	lastSynced,
	booksFinished,
	wordsRead,
	memberSince,
}: {
	bookCount: number;
	highlightCount: number;
	glossaryCount: number;
	lastSynced: number | null;
	booksFinished: number;
	wordsRead: number;
	memberSince: Date | string;
}) {
	const rows = [
		{ label: "Books", value: bookCount },
		{ label: "Finished", value: booksFinished },
		{ label: "Words read", value: formatWords(wordsRead) },
		{ label: "Highlights", value: highlightCount },
		{ label: "Glossary", value: glossaryCount },
		{ label: "Last synced", value: lastSynced ? formatRelative(lastSynced) : "Never" },
		{ label: "Member since", value: formatMemberSince(memberSince) },
	];

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-base">Stats</h2>
			<dl className="grid grid-cols-3 gap-x-4 gap-y-6 sm:gap-x-6">
				{rows.map(({ label, value }) => (
					<div key={label} className="space-y-1">
						<dt className="text-muted-foreground text-xs">{label}</dt>
						<dd className="font-semibold text-lg tabular-nums">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

const LIBRARY_PAGE_SIZE = 25;
const HIGHLIGHTS_PAGE_SIZE = 25;

type ProfileBook = {
	bookId: string;
	title: string;
	author: string | null;
	coverImage: string | null;
	position: number;
	fileSize: number | null;
	wordCount: number | null;
};

function BookCard({ book }: { book: ProfileBook }) {
	const progress = book.fileSize ? Math.round((book.position / book.fileSize) * 100) : null;

	return (
		<div className="flex flex-col gap-1.5">
			<div className="aspect-[2/3] overflow-hidden rounded-md bg-muted">
				{book.coverImage ? (
					<img
						src={book.coverImage}
						alt={book.title}
						className="h-full w-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<BookOpen className="size-6 text-muted-foreground/30" />
					</div>
				)}
			</div>
			{progress !== null && progress > 0 && (
				<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
					<div className="h-full bg-primary" style={{ width: `${progress}%` }} />
				</div>
			)}
			<div>
				<p className="truncate font-medium text-xs leading-tight">{book.title}</p>
				{book.author && <p className="truncate text-muted-foreground text-xs">{book.author}</p>}
			</div>
		</div>
	);
}

function LibrarySection({ books }: { books: ProfileBook[] }) {
	const [showAll, setShowAll] = React.useState(false);
	const visible = showAll ? books : books.slice(0, LIBRARY_PAGE_SIZE);
	const remaining = Math.max(0, books.length - LIBRARY_PAGE_SIZE);

	if (books.length === 0) return null;

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-base">Library</h2>
			<div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
				{visible.map((book) => (
					<BookCard key={book.bookId} book={book} />
				))}
			</div>
			{!showAll && remaining > 0 && (
				<Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
					Show {remaining} more
				</Button>
			)}
		</section>
	);
}

const HIGHLIGHT_COLOR: Record<string, string> = {
	yellow: "#facc15",
	blue: "#60a5fa",
	orange: "#fb923c",
	pink: "#f472b6",
};

type ProfileHighlight = {
	highlightId: string;
	color: string;
	text: string | null;
	note: string | null;
	updatedAt: number;
	bookTitle: string;
};

function HighlightsSection({ highlights }: { highlights: ProfileHighlight[] }) {
	const [showAll, setShowAll] = React.useState(false);
	const visible = showAll ? highlights : highlights.slice(0, HIGHLIGHTS_PAGE_SIZE);
	const remaining = Math.max(0, highlights.length - HIGHLIGHTS_PAGE_SIZE);

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-base">Highlights</h2>
			{highlights.length === 0 ? (
				<p className="text-muted-foreground text-sm">No highlights yet.</p>
			) : (
				<>
					<div className="space-y-3">
						{visible.map((h) => (
							<div key={h.highlightId} className="flex gap-3 rounded-lg border bg-muted/30 p-4">
								<div
									className="mt-0.5 w-1 shrink-0 rounded-full"
									style={{ background: HIGHLIGHT_COLOR[h.color] ?? HIGHLIGHT_COLOR.yellow }}
								/>
								<div className="min-w-0 flex-1 space-y-1.5">
									{h.text && (
										<p className="text-foreground text-sm leading-relaxed">
											&ldquo;{h.text}&rdquo;
										</p>
									)}
									{h.note && (
										<div className="flex items-start gap-1.5">
											<MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
											<p className="text-muted-foreground text-sm">{h.note}</p>
										</div>
									)}
									<p className="text-muted-foreground/60 text-xs">{h.bookTitle}</p>
								</div>
							</div>
						))}
					</div>
					{!showAll && remaining > 0 && (
						<Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
							Show {remaining} more
						</Button>
					)}
				</>
			)}
		</section>
	);
}

type ProfileGlossaryEntry = {
	entryId: string;
	bookId: string | null;
	label: string;
	notes: string | null;
	color: string;
	updatedAt: number;
	bookTitle: string | null;
};

const GLOSSARY_PAGE_SIZE = 25;

function GlossarySection({ entries }: { entries: ProfileGlossaryEntry[] }) {
	const [showAll, setShowAll] = React.useState(false);
	const visible = showAll ? entries : entries.slice(0, GLOSSARY_PAGE_SIZE);
	const remaining = Math.max(0, entries.length - GLOSSARY_PAGE_SIZE);

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-base">Glossary</h2>
			{entries.length === 0 ? (
				<p className="text-muted-foreground text-sm">No glossary entries yet.</p>
			) : (
				<>
					<div className="space-y-3">
						{visible.map((e) => (
							<div key={e.entryId} className="flex gap-3 rounded-lg border bg-muted/30 p-4">
								<div className="mt-0.5 w-1 shrink-0 rounded-full" style={{ background: e.color }} />
								<div className="min-w-0 flex-1 space-y-1.5">
									<p className="flex items-center gap-2 font-medium text-foreground text-sm">
										{e.label}
										{e.bookId === null && (
											<span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
												<Globe className="size-3" />
												Global
											</span>
										)}
									</p>
									{e.notes && <p className="text-muted-foreground text-sm">{e.notes}</p>}
									{e.bookTitle && <p className="text-muted-foreground/60 text-xs">{e.bookTitle}</p>}
								</div>
							</div>
						))}
					</div>
					{!showAll && remaining > 0 && (
						<Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
							Show {remaining} more
						</Button>
					)}
				</>
			)}
		</section>
	);
}

function OpenAppCard() {
	return (
		<a
			href="/app"
			className="group flex items-center justify-between gap-4 rounded-xl border bg-muted/40 px-6 py-5 transition-colors hover:bg-muted"
		>
			<div className="flex items-center gap-4">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<BookOpen className="size-5" />
				</div>
				<div>
					<p className="font-semibold text-sm">Open Lesefluss</p>
					<p className="text-muted-foreground text-sm">Read your library in the browser</p>
				</div>
			</div>
			<ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
		</a>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ProfilePage() {
	const {
		user,
		bookCount,
		highlightCount,
		glossaryCount,
		lastSynced,
		booksFinished,
		wordsRead,
		books,
		highlights,
		glossaryEntries,
	} = Route.useLoaderData();

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
			<div className="mb-10 flex items-start justify-between gap-4">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">Profile</h1>
					<p className="mt-1 text-muted-foreground text-sm">{user.email}</p>
				</div>
				<Link
					to="/account"
					className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
				>
					<Settings className="size-3.5" />
					Account settings
				</Link>
			</div>
			<div className="space-y-10">
				<StatsSection
					bookCount={bookCount}
					highlightCount={highlightCount}
					glossaryCount={glossaryCount}
					lastSynced={lastSynced}
					booksFinished={booksFinished}
					wordsRead={wordsRead}
					memberSince={user.createdAt}
				/>
				{books.length > 0 && (
					<>
						<Separator />
						<LibrarySection books={books} />
					</>
				)}
				<Separator />
				<HighlightsSection highlights={highlights} />
				<Separator />
				<GlossarySection entries={glossaryEntries} />
				<OpenAppCard />
			</div>
		</div>
	);
}
