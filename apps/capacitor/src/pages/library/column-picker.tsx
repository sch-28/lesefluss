import { Button } from "@lesefluss/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { Columns3 } from "lucide-react";
import type React from "react";
import { type ColumnId, TABLE_COLUMNS } from "./table-columns";

type Props = {
	columns: readonly ColumnId[];
	onToggle: (id: ColumnId) => void;
};

const ColumnPicker: React.FC<Props> = ({ columns, onToggle }) => (
	<DropdownMenu>
		<DropdownMenuTrigger asChild>
			<Button variant="ghost" size="icon" aria-label="Columns">
				<Columns3 />
			</Button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" className="min-w-48">
			<DropdownMenuLabel>Columns</DropdownMenuLabel>
			{TABLE_COLUMNS.map((column) => (
				<DropdownMenuCheckboxItem
					key={column.id}
					checked={columns.includes(column.id)}
					disabled={column.id === "title"}
					// Stays open, so several columns change in one go.
					onSelect={(e) => e.preventDefault()}
					onCheckedChange={() => onToggle(column.id)}
				>
					{column.label}
				</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	</DropdownMenu>
);

export default ColumnPicker;
