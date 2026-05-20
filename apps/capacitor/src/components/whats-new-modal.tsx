/**
 * WhatsNewModal: centered dialog that shows changelog entries.
 *
 * Two trigger modes:
 *   1. Auto: opens after an update if there are entries newer than
 *      `lastSeenChangelogDate`. Filters to App and ESP32 tags only
 *      (Website-only entries are hidden from mobile users).
 *   2. Manual: dispatch `lesefluss:show-whats-new` from anywhere to
 *      open with the full filtered changelog (e.g. from Settings).
 *
 * On dismiss, persists the newest entry's date so the auto trigger
 * won't re-fire until the next changelog entry ships.
 */

import { type ChangelogEntry, type ChangelogTag, changelog } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { queryHooks } from "../services/db/hooks";
import { Modal } from "./modal";

const RELEVANT_TAGS = new Set<ChangelogTag>(["App", "ESP32"]);

export const SHOW_WHATS_NEW_EVENT = "lesefluss:show-whats-new";

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

const WhatsNewModal: React.FC = () => {
	const { data: settings } = queryHooks.useSettings();
	const saveSettings = queryHooks.useSaveSettings();
	const [manualOpen, setManualOpen] = useState(false);

	useEffect(() => {
		const handler = () => setManualOpen(true);
		window.addEventListener(SHOW_WHATS_NEW_EVENT, handler);
		return () => window.removeEventListener(SHOW_WHATS_NEW_EVENT, handler);
	}, []);

	const autoEntries = useMemo(() => {
		if (!settings?.onboardingCompleted) return [];
		return entriesNewerThan(settings.lastSeenChangelogDate);
	}, [settings]);

	const isOpen = manualOpen || autoEntries.length > 0;
	const entries = manualOpen ? ALL_RELEVANT_ENTRIES : autoEntries;

	const handleDismiss = () => {
		setManualOpen(false);
		const latest = changelog[0]?.date;
		if (latest && settings && latest !== settings.lastSeenChangelogDate) {
			saveSettings.mutate({ lastSeenChangelogDate: latest });
		}
	};

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) handleDismiss();
			}}
			title={manualOpen ? "Changelog" : "Recent updates"}
			contentClassName="max-h-[85vh] overflow-hidden"
			footer={
				<Button
					className="w-full"
					onClick={handleDismiss}
					disabled={saveSettings.isPending}
				>
					Got it
				</Button>
			}
		>
			<p className="-mt-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				What's new
			</p>
			<div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
				{entries.map((entry) => (
					<section key={entry.date} className="flex flex-col gap-2">
						<header className="flex items-baseline justify-between gap-3">
							<h3 className="font-semibold text-base">{entry.title}</h3>
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
		</Modal>
	);
};

export default WhatsNewModal;
