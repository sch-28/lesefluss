/**
 * Opens on its own after an update (entries newer than `lastSeenChangelogDate`),
 * or with the full changelog when `SHOW_WHATS_NEW_EVENT` is dispatched.
 *
 * Any dismiss, Show me included, persists the newest entry's date so the auto
 * trigger won't re-fire until the next changelog entry ships.
 */

import {
	type ChangelogEntry,
	type ChangelogIcon,
	type ChangelogLink,
	type ChangelogTag,
	changelog,
	changelogEntryKey,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lesefluss/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import { useRouter } from "@tanstack/react-router";
import {
	Bookmark,
	Check,
	ChevronDown,
	ChevronRight,
	Gauge,
	LibraryBig,
	type LucideIcon,
	Monitor,
	Volume2,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../hooks/use-media-query";
import { queryHooks } from "../services/db/hooks";
import { whatsNewLayout } from "./whats-new-layout";

const RELEVANT_TAGS = new Set<ChangelogTag>(["App", "ESP32"]);

export const SHOW_WHATS_NEW_EVENT = "lesefluss:show-whats-new";

const ICONS: Record<ChangelogIcon, LucideIcon> = {
	"library-big": LibraryBig,
	gauge: Gauge,
	"volume-2": Volume2,
	monitor: Monitor,
	bookmark: Bookmark,
	check: Check,
};

function entriesNewerThan(date: string): ChangelogEntry[] {
	return changelog.filter((e) => e.date > date && e.tags.some((t) => RELEVANT_TAGS.has(t)));
}

const ALL_RELEVANT_ENTRIES: ChangelogEntry[] = changelog.filter((e) =>
	e.tags.some((t) => RELEVANT_TAGS.has(t)),
);

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

const EntryIcon: React.FC<{ icon?: ChangelogIcon; isSmall?: boolean }> = ({ icon, isSmall }) => {
	if (!icon) return null;
	const Icon = ICONS[icon];
	return (
		<span
			aria-hidden
			className={cn(
				"grid shrink-0 place-items-center bg-primary/15 text-primary",
				isSmall ? "size-8 rounded-lg" : "size-11 rounded-xl",
			)}
		>
			<Icon className={isSmall ? "size-4" : "size-5"} />
		</span>
	);
};

const Tile: React.FC<{ entry: ChangelogEntry; onShowMe: (link: ChangelogLink) => void }> = ({
	entry,
	onShowMe,
}) => (
	<section className="flex items-start gap-3 rounded-2xl bg-muted p-3" data-testid="whats-new-tile">
		<EntryIcon icon={entry.icon} />
		<div className="min-w-0 flex-1">
			<h3 className="m-0 font-semibold text-[15px]">{entry.title}</h3>
			<p className="m-0 mt-1 text-muted-foreground text-sm">{entry.summary ?? entry.changes[0]}</p>
			{entry.link && (
				<Button
					variant="outline"
					className="relative mt-1.5 rounded-full pr-2 pl-3 before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']"
					onClick={() => entry.link && onShowMe(entry.link)}
					aria-label={`Show me: ${entry.title}`}
				>
					Show me
					<ChevronRight data-icon="inline-end" />
				</Button>
			)}
		</div>
	</section>
);

const ListEntry: React.FC<{ entry: ChangelogEntry; date?: string }> = ({ entry, date }) => (
	<section className="flex items-start gap-3">
		<EntryIcon icon={entry.icon} isSmall />
		<div className="min-w-0 flex-1">
			<header className="flex items-baseline justify-between gap-3">
				<h3 className="m-0 font-semibold text-sm">{entry.title}</h3>
				{date && <span className="shrink-0 text-muted-foreground text-xs">{date}</span>}
			</header>
			<ul className="m-0 mt-1 list-disc pl-4 text-muted-foreground text-sm">
				{entry.changes.map((change) => (
					<li key={change}>{change}</li>
				))}
			</ul>
		</div>
	</section>
);

const AlsoNew: React.FC<{ entries: ChangelogEntry[]; newestDate: string | null }> = ({
	entries,
	newestDate,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const rowRef = useRef<HTMLDivElement>(null);
	// The list opens below the sheet's fold; without the scroll the tap shows nothing.
	useEffect(() => {
		if (isOpen) rowRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
	}, [isOpen]);
	if (entries.length === 0) return null;
	return (
		<div ref={rowRef} className="border-border border-t">
			<button
				type="button"
				className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg font-semibold text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-expanded={isOpen}
				onClick={() => setIsOpen((open) => !open)}
			>
				Also new
				<span className="flex items-center gap-1 font-normal text-muted-foreground text-sm">
					{entries.length} more
					<ChevronDown
						aria-hidden
						className={cn("size-4 transition-transform", isOpen && "rotate-180")}
					/>
				</span>
			</button>
			{isOpen && (
				<div className="flex flex-col gap-4 pb-2" data-testid="whats-new-also-new">
					{entries.map((entry) => (
						<ListEntry
							key={changelogEntryKey(entry)}
							entry={entry}
							date={entry.date === newestDate ? undefined : formatDate(entry.date)}
						/>
					))}
				</div>
			)}
		</div>
	);
};

const FullChangelog: React.FC<{ entries: ChangelogEntry[] }> = ({ entries }) => (
	<div className="flex flex-col gap-4">
		{entries.map((entry) => (
			<section key={changelogEntryKey(entry)} className="flex flex-col gap-2">
				<header className="flex items-baseline justify-between gap-3">
					<h3 className="m-0 font-semibold text-base">{entry.title}</h3>
					<span className="text-muted-foreground text-xs">{formatDate(entry.date)}</span>
				</header>
				<ul className="m-0 list-disc pl-5 text-foreground/85 text-sm">
					{entry.changes.map((change) => (
						<li key={change}>{change}</li>
					))}
				</ul>
			</section>
		))}
	</div>
);

type Shell = {
	Title: React.FC<{ className?: string; children: React.ReactNode }>;
	Description: React.FC<{ className?: string; children: React.ReactNode }>;
};
const DIALOG_SHELL: Shell = { Title: DialogTitle, Description: DialogDescription };
const DRAWER_SHELL: Shell = { Title: DrawerTitle, Description: DrawerDescription };

const WhatsNewModal: React.FC = () => {
	const { data: settings } = queryHooks.useSettings();
	const saveSettings = queryHooks.useSaveSettings();
	const { data: lastReadBookId } = queryHooks.useLastReadBookId();
	const router = useRouter();
	const isWide = useMediaQuery("(min-width: 768px)");
	const [manualOpen, setManualOpen] = useState(false);
	// Closes at once: the saved date only reaches `settings` after the write and refetch.
	const [isAutoDismissed, setIsAutoDismissed] = useState(false);

	useEffect(() => {
		const handler = () => setManualOpen(true);
		window.addEventListener(SHOW_WHATS_NEW_EVENT, handler);
		return () => window.removeEventListener(SHOW_WHATS_NEW_EVENT, handler);
	}, []);

	const autoEntries = useMemo(() => {
		if (!settings?.onboardingCompleted) return [];
		return entriesNewerThan(settings.lastSeenChangelogDate);
	}, [settings]);
	const layout = useMemo(() => whatsNewLayout(autoEntries), [autoEntries]);

	const isOpen = manualOpen || (!isAutoDismissed && autoEntries.length > 0);

	const handleDismiss = () => {
		setManualOpen(false);
		setIsAutoDismissed(true);
		const latest = changelog[0]?.date;
		if (latest && settings && latest !== settings.lastSeenChangelogDate) {
			saveSettings.mutate({ lastSeenChangelogDate: latest });
		}
	};

	const handleShowMe = (link: ChangelogLink) => {
		handleDismiss();
		if (link === "rsvp") {
			void (lastReadBookId
				? router.navigate({
						to: "/tabs/reader/$id",
						params: { id: lastReadBookId },
						search: { mode: "rsvp" },
					})
				: router.navigate({ to: "/tabs/library" }));
			return;
		}
		void router.navigate({ href: link });
	};

	const { Title, Description } = isWide ? DIALOG_SHELL : DRAWER_SHELL;
	const body = (
		<div className="flex max-h-[inherit] min-h-0 flex-col px-4 pt-2 pb-3 md:px-5 md:pt-4">
			<p className="m-0 font-bold text-primary text-xs uppercase tracking-wider">
				{manualOpen ? "All updates" : "What's new"}
			</p>
			<Title className="mt-1 mb-3 font-bold text-[22px] leading-tight">
				{manualOpen ? "Changelog" : "Recent updates"}
			</Title>
			<Description className="sr-only">
				{manualOpen ? "Every change to the app." : "What changed since you last opened the app."}
			</Description>
			<div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2" data-testid="whats-new-scroll">
				{manualOpen ? (
					<FullChangelog entries={ALL_RELEVANT_ENTRIES} />
				) : (
					<div className="flex flex-col gap-2">
						{layout.tiles.map((entry) => (
							<Tile key={changelogEntryKey(entry)} entry={entry} onShowMe={handleShowMe} />
						))}
						<AlsoNew entries={layout.alsoNew} newestDate={layout.newestDate} />
					</div>
				)}
			</div>
			<Button
				className="mt-2 h-12 w-full shrink-0 rounded-xl text-[15px]"
				onClick={handleDismiss}
				disabled={saveSettings.isPending}
			>
				Got it
			</Button>
			{!manualOpen && (
				<Button
					variant="link"
					className="h-11 self-center text-muted-foreground text-xs"
					onClick={() => setManualOpen(true)}
				>
					Full changelog
				</Button>
			)}
		</div>
	);

	const onOpenChange = (open: boolean) => {
		if (!open) handleDismiss();
	};

	if (isWide) {
		return (
			<Dialog open={isOpen} onOpenChange={onOpenChange}>
				<DialogContent
					showCloseButton={false}
					className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[460px]"
					data-testid="whats-new"
				>
					{body}
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent data-testid="whats-new" className="flex flex-col">
				{body}
			</DrawerContent>
		</Drawer>
	);
};

export default WhatsNewModal;
