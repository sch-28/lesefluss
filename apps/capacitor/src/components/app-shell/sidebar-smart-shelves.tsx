import { cn } from "@lesefluss/ui/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { MoreHorizontal, Pin, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { filterToTree } from "../../pages/library/condition-tree";
import { decodeFilterParam, encodeFilterParam } from "../../pages/library/filter-model";
import { ShelfConditionEditor } from "../../pages/library/shelf-condition-editor";
import { type ShelfEntry, useSmartShelves } from "../../pages/library/use-smart-shelves";
import { ShelfActions } from "../smart-shelves/shelf-actions";

const ROW_BUTTON =
	"mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground";

type Props = {
	isCollapsed: boolean;
	onExpand: () => void;
};

export function SidebarSmartShelves({ isCollapsed, onExpand }: Props) {
	const { shelves, counts, isLoading, setBuiltInPinned } = useSmartShelves();
	const location = useLocation();
	const [menuFor, setMenuFor] = useState<ShelfEntry | null>(null);
	const [creating, setCreating] = useState(false);

	const onLibrary = location.pathname === "/tabs/library";
	const search = location.search as { shelf?: string; f?: string };
	const activeId = onLibrary ? search.shelf : undefined;
	const currentFilter = (onLibrary && decodeFilterParam(search.f)) || {};

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
					onClick={() => setCreating(true)}
					aria-label="New smart shelf"
					title="New smart shelf"
					className="inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				>
					<Plus className="size-4" />
				</button>
			</div>
			<ul className="m-0 list-none p-0">
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
							<span className="shrink-0 text-sidebar-foreground/50 text-xs tabular-nums">
								{isLoading ? null : (counts.get(s.id) ?? 0)}
							</span>
						</Link>
						{s.isBuiltIn ? (
							// A built-in only pins, so its one action is a button, not a one-item menu.
							<button
								type="button"
								onClick={() => setBuiltInPinned(s.id, !s.pinned)}
								aria-label={s.pinned ? `Unpin ${s.name}` : `Pin ${s.name}`}
								title={s.pinned ? "Unpin" : "Pin"}
								className={cn(ROW_BUTTON, s.pinned && "text-primary")}
							>
								<Pin className={cn("size-4", s.pinned && "fill-current")} />
							</button>
						) : (
							<button
								type="button"
								onClick={() => setMenuFor(s)}
								aria-label={`${s.name} options`}
								className={ROW_BUTTON}
							>
								<MoreHorizontal className="size-4" />
							</button>
						)}
					</li>
				))}
			</ul>
			<ShelfActions
				shelf={menuFor}
				onClose={() => setMenuFor(null)}
				setBuiltInPinned={setBuiltInPinned}
			/>
			<ShelfConditionEditor
				open={creating}
				onOpenChange={setCreating}
				shelf={null}
				initialTree={filterToTree(currentFilter)}
			/>
		</section>
	);
}
