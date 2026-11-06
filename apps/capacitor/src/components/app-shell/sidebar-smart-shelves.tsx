import { cn } from "@lesefluss/ui/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { decodeFilterParam, encodeFilterParam } from "../../pages/library/filter-model";
import { type ShelfEntry, useSmartShelves } from "../../pages/library/use-smart-shelves";
import { canSaveAsShelf, SaveShelfDialog } from "../smart-shelves/save-shelf-dialog";
import { ShelfActions } from "../smart-shelves/shelf-actions";

type Props = {
	isCollapsed: boolean;
	onExpand: () => void;
};

export function SidebarSmartShelves({ isCollapsed, onExpand }: Props) {
	const { shelves, counts, setBuiltInPinned } = useSmartShelves();
	const location = useLocation();
	const [menuFor, setMenuFor] = useState<ShelfEntry | null>(null);
	const [saving, setSaving] = useState(false);

	const onLibrary = location.pathname === "/tabs/library";
	const search = location.search as { shelf?: string; f?: string };
	const activeId = onLibrary ? search.shelf : undefined;
	const currentFilter = (onLibrary && decodeFilterParam(search.f)) || {};
	const canSave = canSaveAsShelf(currentFilter);

	if (isCollapsed) {
		return (
			<button
				type="button"
				onClick={onExpand}
				title="Smart shelves"
				aria-label="Show smart shelves"
				className="flex w-16 shrink-0 items-center justify-center py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
			>
				<Sparkles className="size-5" />
			</button>
		);
	}

	return (
		<section aria-label="Smart shelves" className="mt-4 flex shrink-0 flex-col">
			<div className="flex items-center justify-between py-1 pr-3 pl-5">
				<h2 className="m-0 font-semibold text-sidebar-foreground/60 text-xs uppercase tracking-wide">
					Smart shelves
				</h2>
				<button
					type="button"
					onClick={() => setSaving(true)}
					disabled={!canSave}
					aria-label="Save current filter as smart shelf"
					title={canSave ? "Save current filter as smart shelf" : "Set a filter to save it"}
					className="inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-40"
				>
					<Plus className="size-4" />
				</button>
			</div>
			<ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
				{shelves.map((s) => (
					<li
						key={s.id}
						onContextMenu={(e) => {
							e.preventDefault();
							setMenuFor(s);
						}}
						data-testid="sidebar-smart-shelf"
						className="group relative flex items-center"
					>
						<Link
							to="/tabs/library"
							search={{ shelf: s.id, f: s.filter ? encodeFilterParam(s.filter) : undefined }}
							data-active={activeId === s.id}
							className="relative flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-5 text-sidebar-foreground/70 text-sm no-underline hover:text-sidebar-foreground data-[active=true]:text-primary data-[active=true]:before:absolute data-[active=true]:before:top-1 data-[active=true]:before:bottom-1 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:bg-primary"
						>
							<span className="min-w-0 flex-1 truncate">{s.name}</span>
							{s.pinned && (
								<span
									role="img"
									aria-label="Pinned"
									className="size-1.5 shrink-0 rounded-full bg-primary"
								/>
							)}
							<span className="shrink-0 text-sidebar-foreground/50 text-xs tabular-nums group-hover:hidden">
								{counts.get(s.id) ?? 0}
							</span>
						</Link>
						<button
							type="button"
							onClick={() => setMenuFor(s)}
							aria-label={`${s.name} options`}
							className="mr-2 hidden size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:inline-flex group-hover:inline-flex"
						>
							<MoreHorizontal className="size-4" />
						</button>
					</li>
				))}
				<li>
					<button
						type="button"
						onClick={() => setSaving(true)}
						disabled={!canSave}
						className={cn(
							"flex w-full items-center gap-2 py-1.5 pl-5 text-left text-sidebar-foreground/50 text-sm hover:text-sidebar-foreground",
							"disabled:pointer-events-none disabled:opacity-50",
						)}
					>
						<Plus className="size-4" />
						Save current filter…
					</button>
				</li>
			</ul>
			<ShelfActions
				shelf={menuFor}
				onClose={() => setMenuFor(null)}
				setBuiltInPinned={setBuiltInPinned}
			/>
			<SaveShelfDialog open={saving} onOpenChange={setSaving} filter={currentFilter} />
		</section>
	);
}
