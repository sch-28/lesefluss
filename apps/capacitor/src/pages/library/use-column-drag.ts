import type React from "react";
import { useState } from "react";
import type { ColumnId } from "./table-columns";

const COLUMN_DRAG_TYPE = "application/x-lesefluss-column";

type Drag = { id: ColumnId; before: number | null };

/**
 * Native drag to reorder columns, for the table header (`axis: "x"`) and the
 * Columns picker (`"y"`). `dropBefore` is the index the marker shows before;
 * title is never dragged and nothing lands before it.
 */
export function useColumnDrag(
	axis: "x" | "y",
	onMove: (id: ColumnId, before: number) => void,
): {
	itemProps: (
		id: ColumnId,
		index: number,
	) => React.HTMLAttributes<HTMLElement> & {
		draggable: boolean;
	};
	dropBefore: number | null;
	draggingId: ColumnId | null;
} {
	const [drag, setDrag] = useState<Drag | null>(null);

	const itemProps = (id: ColumnId, index: number) => ({
		draggable: id !== "title",
		onDragStart: (e: React.DragEvent<HTMLElement>) => {
			// The library root reads drags as books going onto a collection.
			e.stopPropagation();
			e.dataTransfer?.setData(COLUMN_DRAG_TYPE, id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			setDrag({ id, before: null });
		},
		onDragOver: (e: React.DragEvent<HTMLElement>) => {
			if (!drag) return;
			e.preventDefault();
			const box = e.currentTarget.getBoundingClientRect();
			const isAfter =
				axis === "x" ? e.clientX > box.left + box.width / 2 : e.clientY > box.top + box.height / 2;
			const before = Math.max(1, index + (isAfter ? 1 : 0));
			if (before !== drag.before) setDrag({ id: drag.id, before });
		},
		onDrop: (e: React.DragEvent<HTMLElement>) => {
			if (!drag) return;
			e.preventDefault();
			e.stopPropagation();
			if (drag.before !== null) onMove(drag.id, drag.before);
			setDrag(null);
		},
		onDragEnd: () => setDrag(null),
	});

	return { itemProps, dropBefore: drag?.before ?? null, draggingId: drag?.id ?? null };
}
