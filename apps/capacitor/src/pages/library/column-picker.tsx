import { Button } from "@lesefluss/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import { ChevronDown, ChevronUp, Columns3, GripVertical } from "lucide-react";
import type React from "react";
import { type ColumnId, TABLE_COLUMNS } from "./table-columns";
import { useColumnDrag } from "./use-column-drag";

type Props = {
	columns: readonly ColumnId[];
	onToggle: (id: ColumnId) => void;
	/** Moves a shown column to sit before index `before` of `columns`. */
	onMove: (id: ColumnId, before: number) => void;
};

const LABELS = new Map(TABLE_COLUMNS.map((c) => [c.id, c.label]));

/** Shown columns first, in table order and draggable; hidden ones after, to switch on. */
const ColumnPicker: React.FC<Props> = ({ columns, onToggle, onMove }) => {
	const drag = useColumnDrag("y", onMove);
	const hidden = TABLE_COLUMNS.filter((c) => !columns.includes(c.id));
	const last = columns.length - 1;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Columns">
					<Columns3 />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 p-1">
				<p className="m-0 px-2 py-1.5 font-medium text-sm">Columns</p>
				<ul className="m-0 flex list-none flex-col p-0">
					{columns.map((id, index) => {
						const label = LABELS.get(id) ?? id;
						const isTitle = id === "title";
						return (
							<li
								key={id}
								{...drag.itemProps(id, index)}
								className={cn(
									"relative flex h-8 items-center gap-1 rounded-md px-1 text-sm",
									drag.draggingId === id && "opacity-50",
								)}
							>
								{drag.dropBefore === index && <DropMarker edge="top" />}
								{drag.dropBefore === index + 1 && index === last && <DropMarker edge="bottom" />}
								<GripVertical
									aria-hidden
									className={cn(
										"size-4 shrink-0 text-muted-foreground",
										isTitle ? "invisible" : "cursor-grab",
									)}
								/>
								<label className="flex min-w-0 flex-1 items-center gap-2">
									<input
										type="checkbox"
										checked
										disabled={isTitle}
										onChange={() => onToggle(id)}
										className="size-4 accent-primary"
									/>
									<span className="truncate">{label}</span>
								</label>
								{!isTitle && (
									<>
										<MoveButton
											label={`Move ${label} up`}
											disabled={index <= 1}
											onClick={() => onMove(id, index - 1)}
										>
											<ChevronUp aria-hidden className="size-4" />
										</MoveButton>
										<MoveButton
											label={`Move ${label} down`}
											disabled={index >= last}
											onClick={() => onMove(id, index + 2)}
										>
											<ChevronDown aria-hidden className="size-4" />
										</MoveButton>
									</>
								)}
							</li>
						);
					})}
					{hidden.map((column) => (
						<li key={column.id} className="flex h-8 items-center gap-1 rounded-md px-1 text-sm">
							<GripVertical aria-hidden className="invisible size-4 shrink-0" />
							<label className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
								<input
									type="checkbox"
									checked={false}
									onChange={() => onToggle(column.id)}
									className="size-4 accent-primary"
								/>
								<span className="truncate">{column.label}</span>
							</label>
						</li>
					))}
				</ul>
			</PopoverContent>
		</Popover>
	);
};

const MoveButton: React.FC<{
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: React.ReactNode;
}> = ({ label, disabled, onClick, children }) => (
	<button
		type="button"
		aria-label={label}
		disabled={disabled}
		onClick={onClick}
		className="flex size-6 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted disabled:opacity-30"
	>
		{children}
	</button>
);

const DropMarker: React.FC<{ edge: "top" | "bottom" }> = ({ edge }) => (
	<span
		aria-hidden
		data-testid="column-drop-marker"
		className={cn(
			"pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary",
			edge === "top" ? "-top-px" : "-bottom-px",
		)}
	/>
);

export default ColumnPicker;
