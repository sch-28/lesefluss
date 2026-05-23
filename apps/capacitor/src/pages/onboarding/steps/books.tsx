import { cn } from "@lesefluss/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import CoverImage from "../../../components/cover-image";
import { CATALOG_ENABLED, getCoverUrl, getLanding } from "../../../services/catalog/client";
import { importFromCatalog } from "../../../services/catalog/import";
import { catalogKeys } from "../../../services/catalog/query-keys";
import { log } from "../../../utils/log";
import { useOnboardingFooter } from "../footer-context";

const LANG_STORAGE_KEY = "explore-lang";

const BooksStep: React.FC = () => {
	const { next, setFooter } = useOnboardingFooter();
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

	// Catalog not configured for this build → skip the step immediately.
	useEffect(() => {
		if (!CATALOG_ENABLED) next();
	}, [next]);

	useEffect(() => {
		if (landingQuery.isError) {
			log.warn("onboarding", "landing failed:", landingQuery.error);
		}
	}, [landingQuery.isError, landingQuery.error]);

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

	const addSelected = useCallback(async () => {
		if (importing) return;
		if (selected.size === 0) {
			next();
			return;
		}
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
		next();
	}, [importing, selected, next]);

	useEffect(() => {
		const label = importing
			? `Adding... ${progress}%`
			: selected.size
				? `Add ${selected.size}`
				: "Continue";
		setFooter({ primary: { label, onClick: addSelected, disabled: importing } });
	}, [importing, progress, selected, addSelected, setFooter]);

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Start with a classic</h2>
			<p className="mt-2 text-muted-foreground">
				Tap any that catch your eye — we'll add them to your library. Optional.
			</p>

			{landingQuery.isPending ? (
				<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden>
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
							key={i}
							className="flex flex-col gap-2 rounded-lg border-2 border-border p-2"
						>
							<div className="aspect-[2/3] animate-pulse rounded-md bg-muted" />
							<div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
							<div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
						</div>
					))}
				</div>
			) : landingQuery.isError || classics.length === 0 ? (
				<p className="mt-8 text-muted-foreground/70 text-sm">
					{landingQuery.isError ? "Couldn't reach the catalog." : "No classics available."}
				</p>
			) : (
				<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
					{classics.map((b) => {
						const isSelected = selected.has(b.id);
						const cover = getCoverUrl(b.id, b.coverUrl);
						return (
							<button
								type="button"
								key={b.id}
								onClick={() => toggle(b.id)}
								disabled={importing}
								aria-pressed={isSelected}
								className={cn(
									"flex flex-col gap-2 rounded-lg border-2 p-2 text-left transition-colors disabled:opacity-50",
									isSelected
										? "border-primary bg-primary/5"
										: "border-border bg-card hover:border-muted-foreground/30",
								)}
							>
								<div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted">
									<CoverImage src={cover} alt={b.title} />
									{isSelected && (
										<span className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
											<Check className="size-4" />
										</span>
									)}
								</div>
								<div className="font-medium text-foreground text-xs leading-tight">{b.title}</div>
								{b.author && (
									<div className="text-muted-foreground text-xs leading-tight">{b.author}</div>
								)}
							</button>
						);
					})}
				</div>
			)}

			{importing && (
				<div
					className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="Importing books"
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
				</div>
			)}
		</div>
	);
};

export default BooksStep;
