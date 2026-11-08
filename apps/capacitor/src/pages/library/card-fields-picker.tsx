import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import {
	CARD_FIELDS,
	type CardFieldId,
	type CardFieldSettings,
	type CardSurface,
} from "./card-fields";

type Props = {
	/** The layout on screen; its fields are the ones edited. */
	surface: CardSurface;
	settings: CardFieldSettings;
	onToggle: (surface: CardSurface, id: CardFieldId) => void;
	/** A card of this library drawn with `fields`, or null when there is no book to show. */
	renderPreview: (surface: CardSurface, fields: readonly CardFieldId[]) => React.ReactNode;
};

export const CardFieldsPanel: React.FC<Props> = ({
	surface,
	settings,
	onToggle,
	renderPreview,
}) => {
	const fields = settings[surface];
	const preview = renderPreview(surface, fields);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex gap-3">
				<ul className="m-0 flex flex-1 list-none flex-col p-0">
					{CARD_FIELDS.map(({ id, label }) => (
						<li key={id}>
							<label className="flex h-8 items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={fields.includes(id)}
									onChange={() => onToggle(surface, id)}
									className="size-4 accent-primary"
								/>
								{label}
							</label>
						</li>
					))}
				</ul>
				{preview && surface === "grid" && (
					<PreviewFrame className="w-28 shrink-0 self-start">{preview}</PreviewFrame>
				)}
			</div>
			{preview && surface === "list" && <PreviewFrame>{preview}</PreviewFrame>}
		</div>
	);
};

const PreviewFrame: React.FC<{ className?: string; children: React.ReactNode }> = ({
	className,
	children,
}) => (
	<figure className={cn("m-0", className)} data-testid="card-fields-preview">
		<figcaption className="mb-1 text-muted-foreground text-xs">Preview</figcaption>
		<div inert className="pointer-events-none">
			{children}
		</div>
	</figure>
);
