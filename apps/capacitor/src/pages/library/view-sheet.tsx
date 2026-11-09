import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { Check, LayoutGrid, List, type LucideIcon, Table2 } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import type { CardFieldId, CardFieldSettings, CardSurface } from "./card-fields";
import { CardFieldsPanel } from "./card-fields-picker";
import { ColumnList } from "./column-picker";
import { GROUP_LABELS, GROUP_OPTIONS, type GroupBy } from "./group-by";
import type { LibraryViewMode } from "./header-controls";
import type { ColumnId } from "./table-columns";

const LAYOUTS: { id: LibraryViewMode; label: string; icon: LucideIcon }[] = [
	{ id: "grid", label: "Grid", icon: LayoutGrid },
	{ id: "list", label: "List", icon: List },
	{ id: "table", label: "Table", icon: Table2 },
];

export type ViewPanelProps = {
	view: LibraryViewMode;
	onView: (view: LibraryViewMode) => void;
	/** The table needs the width, so only desktop offers it. */
	canTable: boolean;
	cardFields: {
		settings: CardFieldSettings;
		onToggle: (surface: CardSurface, id: CardFieldId) => void;
		renderPreview: (surface: CardSurface, fields: readonly CardFieldId[]) => React.ReactNode;
	};
	columns: {
		ids: readonly ColumnId[];
		onToggle: (id: ColumnId) => void;
		onMove: (id: ColumnId, before: number) => void;
	};
	groupBy: GroupBy;
	onGroupBy: (groupBy: GroupBy) => void;
};

type Props = ViewPanelProps & {
	isDesktop: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Set when G opened it: focus lands on the current grouping. */
	focusGroupBy: boolean;
};

const HEADING = "m-0 mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide";

/** The View control: a popover on desktop, a bottom sheet on the phone. */
export const ViewSheet: React.FC<Props> = ({
	isDesktop,
	open,
	onOpenChange,
	focusGroupBy,
	...panel
}) => {
	const contentRef = useRef<HTMLDivElement>(null);
	// Read at close: the owner clears focusGroupBy in the same update that closes.
	const openedKeyedRef = useRef(false);
	const Icon = LAYOUTS.find((l) => l.id === panel.view)?.icon ?? LayoutGrid;
	const trigger = (
		<Button
			variant="ghost"
			size="icon"
			aria-label="View"
			title="View"
			onClick={isDesktop ? undefined : () => onOpenChange(true)}
		>
			<Icon />
		</Button>
	);
	const pickGroup = (groupBy: GroupBy) => {
		panel.onGroupBy(groupBy);
		if (focusGroupBy) onOpenChange(false);
	};

	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				<PopoverContent
					ref={contentRef}
					align="end"
					className="max-h-[80vh] w-80 overflow-y-auto p-3"
					data-testid="view-sheet"
					onOpenAutoFocus={(e) => {
						openedKeyedRef.current = focusGroupBy;
						if (!focusGroupBy) return;
						const row = contentRef.current?.querySelector<HTMLElement>(
							'[data-group-row][aria-checked="true"]',
						);
						if (!row) return;
						e.preventDefault();
						row.focus();
					}}
					onCloseAutoFocus={(e) => {
						// Keeps focus off the trigger so the grid's arrow keys work again.
						if (openedKeyedRef.current) e.preventDefault();
						openedKeyedRef.current = false;
					}}
				>
					<ViewPanel {...panel} onGroupBy={pickGroup} />
				</PopoverContent>
			</Popover>
		);
	}
	return (
		<>
			{trigger}
			<Drawer open={open} onOpenChange={onOpenChange}>
				<DrawerContent data-testid="view-sheet">
					<DrawerHeader>
						<DrawerTitle>View</DrawerTitle>
					</DrawerHeader>
					<div className="overflow-y-auto px-4 pb-6">
						<ViewPanel {...panel} onGroupBy={pickGroup} />
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
};

export const ViewPanel: React.FC<ViewPanelProps> = ({
	view,
	onView,
	canTable,
	cardFields,
	columns,
	groupBy,
	onGroupBy,
}) => {
	const layouts = canTable ? LAYOUTS : LAYOUTS.filter((l) => l.id !== "table");
	return (
		<div className="flex flex-col gap-4">
			<section>
				<h3 className={HEADING}>Layout</h3>
				<SegmentedControl
					aria-label="Layout"
					value={view}
					onValueChange={onView}
					options={layouts.map(({ id, label, icon: Icon }) => ({
						value: id,
						label: (
							<>
								<Icon className="size-4" />
								{label}
							</>
						),
					}))}
				/>
			</section>
			<section>
				<h3 className={HEADING}>{view === "table" ? "Columns" : "Card fields"}</h3>
				{view === "table" ? (
					<ColumnList columns={columns.ids} onToggle={columns.onToggle} onMove={columns.onMove} />
				) : (
					<CardFieldsPanel surface={view} {...cardFields} />
				)}
			</section>
			<GroupByList groupBy={groupBy} onGroupBy={onGroupBy} />
		</div>
	);
};

const GroupByList: React.FC<{ groupBy: GroupBy; onGroupBy: (groupBy: GroupBy) => void }> = ({
	groupBy,
	onGroupBy,
}) => (
	<section>
		<h3 className={HEADING}>Group by</h3>
		<div
			role="radiogroup"
			aria-label="Group by"
			className="flex flex-col"
			onKeyDown={(e) => {
				if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
				const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-group-row]")];
				e.preventDefault();
				const at = rows.indexOf(e.target as HTMLElement);
				const step = e.key === "ArrowDown" ? 1 : -1;
				rows[at < 0 ? 0 : (at + step + rows.length) % rows.length]?.focus();
			}}
		>
			{GROUP_OPTIONS.map((option) => (
				// biome-ignore lint/a11y/useSemanticElements: a styled choice row; a native radio input cannot hold the icon and check layout
				<button
					key={option}
					type="button"
					role="radio"
					data-group-row
					aria-checked={groupBy === option}
					onClick={() => onGroupBy(option)}
					className="flex h-9 items-center justify-between gap-3 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted"
				>
					<span className="truncate">{GROUP_LABELS[option]}</span>
					{groupBy === option && <Check className="size-4 shrink-0 text-primary" />}
				</button>
			))}
		</div>
	</section>
);
