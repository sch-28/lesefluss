import { IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import CoverImage from "../../../components/cover-image";
import { CATALOG_ENABLED, getCoverUrl, getLanding } from "../../../services/catalog/client";
import { importFromCatalog } from "../../../services/catalog/import";
import { catalogKeys } from "../../../services/catalog/query-keys";
import { log } from "../../../utils/log";

interface Props {
	onNext: () => void;
	onImportingChange?: (importing: boolean) => void;
}

const LANG_STORAGE_KEY = "explore-lang";

const BooksStep: React.FC<Props> = ({ onNext, onImportingChange }) => {
	const lang = localStorage.getItem(LANG_STORAGE_KEY) ?? "en";

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [importing, setImporting] = useState(false);
	const [progress, setProgress] = useState(0);
	const cancelledRef = useRef(false);

	const landingQuery = useQuery({
		queryKey: catalogKeys.landing(lang),
		queryFn: ({ signal }) => getLanding(lang, signal),
		enabled: CATALOG_ENABLED,
	});

	// If the catalog isn't configured for this build, skip the step immediately.
	useEffect(() => {
		if (!CATALOG_ENABLED) onNext();
	}, [onNext]);

	useEffect(() => {
		if (landingQuery.isError) {
			log.warn("onboarding", "landing failed:", landingQuery.error);
		}
	}, [landingQuery.isError, landingQuery.error]);

	useEffect(() => {
		onImportingChange?.(importing);
	}, [importing, onImportingChange]);

	// On unmount, signal the import loop to stop applying state updates.
	useEffect(() => {
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	const classics = landingQuery.data?.classics ?? [];

	const toggle = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const addSelected = async () => {
		if (selected.size === 0 || importing) return;
		setImporting(true);
		setProgress(0);
		const ids = Array.from(selected);
		for (let i = 0; i < ids.length; i++) {
			if (cancelledRef.current) return;
			const id = ids[i];
			try {
				await importFromCatalog(id, (pct) => {
					if (cancelledRef.current) return;
					setProgress(Math.round(((i + pct / 100) / ids.length) * 100));
				});
			} catch (err) {
				log.warn("onboarding", "import failed for", id, err);
			}
			if (cancelledRef.current) return;
			setProgress(Math.round(((i + 1) / ids.length) * 100));
		}
		if (cancelledRef.current) return;
		setImporting(false);
		onNext();
	};

	const addLabel = importing
		? `Adding… ${progress}%`
		: selected.size
			? `Add ${selected.size}`
			: "Add";

	return (
		<div className="onboarding-step">
			<h2 className="onboarding-step-title">Start with a classic</h2>
			<p className="onboarding-step-sub">
				Tap any that catch your eye — we'll add them to your library. Optional.
			</p>

			{landingQuery.isPending ? (
				<div className="onboarding-books-loading">
					<IonSpinner />
				</div>
			) : landingQuery.isError || classics.length === 0 ? (
				<p className="onboarding-step-sub" style={{ opacity: 0.6 }}>
					{landingQuery.isError ? "Couldn't reach the catalog." : "No classics available."}
				</p>
			) : (
				<div className="onboarding-books-list">
					{classics.map((b) => {
						const isSelected = selected.has(b.id);
						const cover = getCoverUrl(b.id, b.coverUrl);
						return (
							<button
								type="button"
								key={b.id}
								className={
									isSelected
										? "onboarding-book-card onboarding-book-card--selected"
										: "onboarding-book-card"
								}
								onClick={() => toggle(b.id)}
								disabled={importing}
								aria-pressed={isSelected}
							>
								<div className="onboarding-book-cover">
									<CoverImage src={cover} alt={b.title} />
									{isSelected && <span className="onboarding-book-check">✓</span>}
								</div>
								<div className="onboarding-book-title">{b.title}</div>
								{b.author && <div className="onboarding-book-author">{b.author}</div>}
							</button>
						);
					})}
				</div>
			)}

			{importing && (
				<div
					className="onboarding-books-progress"
					role="progressbar"
					aria-label="Importing books"
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div className="onboarding-books-progress-bar" style={{ width: `${progress}%` }} />
				</div>
			)}

			<div className="onboarding-actions">
				<button
					type="button"
					className="onboarding-btn onboarding-btn--primary"
					onClick={addSelected}
					disabled={selected.size === 0 || importing}
				>
					{addLabel}
				</button>
				<button
					type="button"
					className="onboarding-btn onboarding-btn--primary"
					onClick={onNext}
					disabled={importing}
				>
					Skip
				</button>
			</div>
		</div>
	);
};

export default BooksStep;
