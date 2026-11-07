import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@lesefluss/ui/toggle-group";
import { SlidersHorizontal } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
	CARD_FIELDS,
	type CardFieldId,
	type CardFieldSettings,
	type CardSurface,
} from "./card-fields";

type Props = {
	/** The view on screen; the picker opens on its fields. */
	surface: CardSurface;
	settings: CardFieldSettings;
	onToggle: (surface: CardSurface, id: CardFieldId) => void;
	isDesktop: boolean;
	/** A card of this library drawn with `fields`, or null when there is no book to show. */
	renderPreview: (surface: CardSurface, fields: readonly CardFieldId[]) => React.ReactNode;
};

const SURFACE_LABELS: Record<CardSurface, string> = { grid: "Grid", list: "List" };

const Trigger: React.FC<React.ComponentProps<typeof Button>> = (props) => (
	<Button variant="ghost" size="icon" aria-label="Card fields" {...props}>
		<SlidersHorizontal />
	</Button>
);

/** Desktop: a popover; phone: a bottom sheet. Both edit the fields with a live preview. */
const CardFieldsPicker: React.FC<Props> = ({ isDesktop, ...panel }) => {
	const [open, setOpen] = useState(false);
	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Trigger />
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80 p-3">
					<p className="m-0 mb-2 font-medium text-sm">Card fields</p>
					<CardFieldsPanel {...panel} />
				</PopoverContent>
			</Popover>
		);
	}
	return (
		<>
			<Trigger onClick={() => setOpen(true)} />
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent data-testid="card-fields-sheet">
					<DrawerHeader className="text-left">
						<DrawerTitle>Card fields</DrawerTitle>
						<DrawerDescription>Kept on this device.</DrawerDescription>
					</DrawerHeader>
					<div className="overflow-y-auto px-5 pb-6">
						<CardFieldsPanel {...panel} />
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
};

export const CardFieldsPanel: React.FC<Omit<Props, "isDesktop">> = ({
	surface,
	settings,
	onToggle,
	renderPreview,
}) => {
	const [editing, setEditing] = useState<CardSurface>(surface);
	const fields = settings[editing];
	const preview = renderPreview(editing, fields);
	return (
		<div className="flex flex-col gap-3">
			<ToggleGroup
				type="single"
				variant="outline"
				size="sm"
				value={editing}
				onValueChange={(value) => value && setEditing(value as CardSurface)}
				aria-label="Cards to edit"
			>
				{(["grid", "list"] as const).map((s) => (
					<ToggleGroupItem key={s} value={s} className="px-3">
						{SURFACE_LABELS[s]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<div className="flex gap-3">
				<ul className="m-0 flex flex-1 list-none flex-col p-0">
					{CARD_FIELDS.map(({ id, label }) => (
						<li key={id}>
							<label className="flex h-8 items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={fields.includes(id)}
									onChange={() => onToggle(editing, id)}
									className="size-4 accent-primary"
								/>
								{label}
							</label>
						</li>
					))}
				</ul>
				{preview && editing === "grid" && (
					<PreviewFrame className="w-28 shrink-0 self-start">{preview}</PreviewFrame>
				)}
			</div>
			{preview && editing === "list" && <PreviewFrame>{preview}</PreviewFrame>}
		</div>
	);
};

const PreviewFrame: React.FC<{ className?: string; children: React.ReactNode }> = ({
	className,
	children,
}) => (
	<figure className={`m-0 ${className ?? ""}`} data-testid="card-fields-preview">
		<figcaption className="mb-1 text-muted-foreground text-xs">Preview</figcaption>
		<div inert className="pointer-events-none">
			{children}
		</div>
	</figure>
);

export default CardFieldsPicker;
