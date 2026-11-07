import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import { ChevronRight } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { AllSeriesList } from "./all-series-list";
import { CHIP } from "./collection-shelf-row";
import { CHIP_SERIES_LIMIT, type SeriesEntry, seriesEntryKey } from "./series-nav";
import { useActiveSeriesKey, useOpenSeries, useSeriesEntries } from "./use-series-nav";

/** The phone's Series switcher under the shelf chips; All series opens as a sheet. */
const SeriesChipRow: React.FC = () => {
	const { entries, covers } = useSeriesEntries();
	const activeKey = useActiveSeriesKey();
	const openSeries = useOpenSeries();
	const [sheetOpen, setSheetOpen] = useState(false);

	if (entries.length === 0) return null;

	const pick = (entry: SeriesEntry) => {
		setSheetOpen(false);
		openSeries(entry);
	};

	return (
		<div className="md:hidden">
			<div
				role="toolbar"
				aria-label="Series"
				className="flex items-center gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
			>
				<span className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					Series
				</span>
				<button
					type="button"
					onClick={() => setSheetOpen(true)}
					className={cn(CHIP, "border-border bg-card text-foreground")}
				>
					All {entries.length}
					<ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
				</button>
				{entries.slice(0, CHIP_SERIES_LIMIT).map((e) => {
					const active = activeKey === seriesEntryKey(e);
					return (
						<button
							key={seriesEntryKey(e)}
							type="button"
							aria-pressed={active}
							data-testid="series-chip"
							onClick={() => openSeries(e)}
							className={cn(
								CHIP,
								active
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-card text-foreground",
							)}
						>
							<span aria-hidden className="opacity-60">
								{e.kind === "serial" ? "≋" : "#"}
							</span>
							{e.name}
							<span className="text-xs tabular-nums opacity-60">{e.count}</span>
						</button>
					);
				})}
			</div>
			<Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
				<DrawerContent
					onEscapeKeyDown={(e) => {
						// The sheet's Esc listener runs in the capture phase, before the list can
						// clear its search; a typed search takes the first Esc.
						const list = e.target instanceof Element ? e.target.closest("[data-all-series]") : null;
						if (list?.querySelector<HTMLInputElement>("input[type=search]")?.value) {
							e.preventDefault();
						}
					}}
				>
					<DrawerHeader className="border-border border-b">
						<DrawerTitle className="text-center">All series · {entries.length}</DrawerTitle>
					</DrawerHeader>
					<div className="flex h-[70vh] min-h-0 flex-col pt-3">
						<AllSeriesList entries={entries} covers={covers} onPick={pick} compact />
					</div>
				</DrawerContent>
			</Drawer>
		</div>
	);
};

export default SeriesChipRow;
