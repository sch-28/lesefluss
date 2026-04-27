/**
 * WhatsNewModal — centered dialog that shows changelog entries.
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

import { IonButton, IonModal } from "@ionic/react";
import { type ChangelogEntry, type ChangelogTag, changelog } from "@lesefluss/rsvp-core";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { queryHooks } from "../services/db/hooks";

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
	const modalRef = useRef<HTMLIonModalElement>(null);
	const [manualOpen, setManualOpen] = useState(false);

	useEffect(() => {
		const handler = () => setManualOpen(true);
		window.addEventListener(SHOW_WHATS_NEW_EVENT, handler);
		return () => window.removeEventListener(SHOW_WHATS_NEW_EVENT, handler);
	}, []);

	const autoEntries = useMemo(() => {
		if (!settings || !settings.onboardingCompleted) return [];
		return entriesNewerThan(settings.lastSeenChangelogDate);
	}, [settings]);

	const isOpen = manualOpen || autoEntries.length > 0;
	const entries = manualOpen ? ALL_RELEVANT_ENTRIES : autoEntries;

	// Dismissing always advances `lastSeenChangelogDate` to the newest entry,
	// even when opened manually from Settings. Manually peeking the changelog
	// counts as "seen" and silences any pending auto-popup.
	const handleDismiss = () => {
		setManualOpen(false);
		const latest = changelog[0]?.date;
		if (latest && settings && latest !== settings.lastSeenChangelogDate) {
			saveSettings.mutate({ lastSeenChangelogDate: latest });
		}
	};

	return (
		<IonModal
			ref={modalRef}
			isOpen={isOpen}
			onDidDismiss={handleDismiss}
			className="whats-new-modal"
		>
			<div className="whats-new-shell">
				<div className="whats-new-body">
					<p className="whats-new-eyebrow">What's new</p>
					<h2 className="whats-new-heading">{manualOpen ? "Changelog" : "Recent updates"}</h2>

					<div className="whats-new-entries">
						{entries.map((entry) => (
							<section key={entry.date} className="whats-new-entry">
								<header className="whats-new-entry-head">
									<h3>{entry.title}</h3>
									<span className="whats-new-date">{formatDate(entry.date)}</span>
								</header>
								<ul>
									{entry.changes.map((change) => (
										<li key={change}>{change}</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</div>

				<div className="whats-new-footer">
					<IonButton
						expand="block"
						onClick={() => modalRef.current?.dismiss()}
						disabled={saveSettings.isPending}
					>
						Got it
					</IonButton>
				</div>
			</div>
		</IonModal>
	);
};

export default WhatsNewModal;
