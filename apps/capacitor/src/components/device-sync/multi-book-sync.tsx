import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { useCallback, useEffect, useState } from "react";
import { useMultiBookAdapter } from "../../hooks/use-multi-book-adapter";
import type { MultiBookLibraryEntry, MultiBookStorage } from "../../services/devices";
import type { DeviceCapabilities } from "../../services/devices/capabilities";
import { log } from "../../utils/log";

export type MultiBookSyncProps = {
	caps: DeviceCapabilities;
};

function formatBytes(bytes: number): string {
	if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
	return `${bytes} B`;
}

function progressLabel(words: number, total: number): string {
	if (total === 0) {
		return "0%";
	}
	return `${Math.min(100, Math.round((words / total) * 100))}%`;
}

export function MultiBookSync(_props: MultiBookSyncProps) {
	const adapter = useMultiBookAdapter();
	const [library, setLibrary] = useState<MultiBookLibraryEntry[]>([]);
	const [activeHash, setActiveHash] = useState<string>("");
	const [storage, setStorage] = useState<MultiBookStorage | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

	useEffect(() => {
		if (!adapter) {
			return;
		}
		let cancelled = false;
		const load = async () => {
			const [libRes, activeRes, storageRes] = await Promise.all([
				adapter.read("library"),
				adapter.read("active"),
				adapter.read("storage"),
			]);
			if (cancelled) {
				return;
			}
			if (libRes.success && libRes.data) {
				setLibrary(libRes.data);
			} else if (!libRes.success) {
				log.warn("multibook-ui", "library read failed:", libRes.error);
			}
			if (activeRes.success && activeRes.data) {
				setActiveHash(activeRes.data.hash);
			}
			if (storageRes.success && storageRes.data) {
				setStorage(storageRes.data);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [adapter, refreshKey]);

	const selectActive = useCallback(
		async (hash: string) => {
			if (!adapter) {
				return;
			}
			const result = await adapter.write("active", { hash });
			if (result.success) {
				setActiveHash(hash);
			} else {
				log.warn("multibook-ui", "set active failed:", result.error);
			}
		},
		[adapter],
	);

	if (!adapter) {
		return <p className="px-4 py-6 text-muted-foreground text-sm">Not connected.</p>;
	}

	return (
		<div className="space-y-6 px-4 py-4">
			<section>
				<header className="mb-2 flex items-center justify-between">
					<h2 className="font-semibold text-sm">Library on device</h2>
					<Button variant="ghost" size="sm" onClick={refresh}>
						Refresh
					</Button>
				</header>
				{library.length === 0 ? (
					<p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-muted-foreground text-sm">
						No books on device yet. Send a book from your library.
					</p>
				) : (
					<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
						{library.map((book) => {
							const isActive = book.hash === activeHash;
							return (
								<li key={book.hash}>
									<button
										type="button"
										className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
											isActive ? "bg-accent/40" : ""
										}`}
										onClick={() => selectActive(book.hash)}
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium text-sm">
												{book.title || book.hash}
											</span>
											<span className="block truncate text-muted-foreground text-xs">
												{[book.author, book.category].filter(Boolean).join(" · ")}
											</span>
										</span>
										<span className="shrink-0 text-muted-foreground text-xs">
											{progressLabel(book.progressWords, book.words)}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			{storage && (
				<section>
					<h2 className="mb-2 font-semibold text-sm">Storage</h2>
					<div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
						<p>
							{formatBytes(storage.totalBytes - storage.freeBytes)} used of{" "}
							{formatBytes(storage.totalBytes)} ({storage.bookCount} books)
						</p>
						<Progress
							value={
								storage.totalBytes === 0
									? 0
									: Math.round(
											((storage.totalBytes - storage.freeBytes) / storage.totalBytes) * 100,
										)
							}
							className="mt-2"
						/>
					</div>
				</section>
			)}
		</div>
	);
}
