import { Link, useNavigate } from "@tanstack/react-router";
import { Hash } from "lucide-react";
import { SIDEBAR_SERIES_LIMIT, seriesEntryKey } from "../../pages/library/series-nav";
import {
	ALL_SERIES_PATH,
	useActiveSeriesKey,
	useSeriesEntries,
} from "../../pages/library/use-series-nav";

const ROW =
	"relative flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-3 pl-5 text-sidebar-foreground/70 text-sm no-underline hover:text-sidebar-foreground data-[active=true]:text-primary data-[active=true]:before:absolute data-[active=true]:before:top-1 data-[active=true]:before:bottom-1 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:bg-primary";

const COUNT = "shrink-0 text-sidebar-foreground/50 text-xs tabular-nums";

export function SidebarSeries({ isCollapsed }: { isCollapsed: boolean }) {
	const { entries } = useSeriesEntries();
	const activeKey = useActiveSeriesKey();
	const navigate = useNavigate();

	if (entries.length === 0) return null;

	if (isCollapsed) {
		return (
			<button
				type="button"
				onClick={() => navigate({ to: ALL_SERIES_PATH })}
				title="All series"
				aria-label="All series"
				className="flex w-16 shrink-0 items-center justify-center py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
			>
				<Hash className="size-5" />
			</button>
		);
	}

	const shown = entries.slice(0, SIDEBAR_SERIES_LIMIT);
	const hasMore = entries.length > SIDEBAR_SERIES_LIMIT;
	const activeHidden =
		activeKey !== undefined &&
		activeKey !== "all" &&
		entries.some((e) => seriesEntryKey(e) === activeKey) &&
		!shown.some((e) => seriesEntryKey(e) === activeKey);

	return (
		<section aria-label="Series" className="mt-4 flex shrink-0 flex-col">
			<div className="py-1 pr-3 pl-5">
				<h2 className="m-0 font-semibold text-sidebar-foreground/60 text-xs uppercase tracking-wide">
					Series
				</h2>
			</div>
			<ul className="m-0 list-none p-0">
				{shown.map((e) => (
					<li key={seriesEntryKey(e)} data-testid="sidebar-series" className="flex">
						<Link
							{...(e.kind === "serial"
								? { to: "/tabs/library/series/$id", params: { id: e.id } }
								: { to: "/tabs/library", search: { collection: e.id } })}
							data-active={activeKey === seriesEntryKey(e)}
							className={ROW}
						>
							<span aria-hidden className="w-3 shrink-0 text-center text-sidebar-foreground/50">
								{e.kind === "serial" ? "≋" : "#"}
							</span>
							<span className="min-w-0 flex-1 truncate">{e.name}</span>
							<span className={COUNT}>{e.count}</span>
						</Link>
					</li>
				))}
				{hasMore && (
					<li className="flex">
						<Link
							to={ALL_SERIES_PATH}
							data-active={activeKey === "all" || activeHidden}
							className={ROW}
						>
							<span className="min-w-0 flex-1 truncate">All series</span>
							<span className={COUNT}>{entries.length}</span>
						</Link>
					</li>
				)}
			</ul>
		</section>
	);
}
