import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Check } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { PickerTrigger } from "@/components/picker-trigger";

type Option = { value: string; label: string };

export const CommentTargetPicker: React.FC<{
	value: string;
	options: readonly Option[];
	disabled?: boolean;
	onChange: (value: string) => void;
}> = ({ value, options, disabled, onChange }) => {
	const [open, setOpen] = useState(false);
	const current = options.find((o) => o.value === value) ?? options[0];
	return (
		<>
			<PickerTrigger
				aria-label="What the comment is about"
				value={current?.label ?? null}
				placeholder="At my current position"
				disabled={disabled}
				onClick={() => setOpen(true)}
			/>
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>What the comment is about</DrawerTitle>
					</DrawerHeader>
					<div className="flex max-h-[60vh] flex-col overflow-y-auto px-2 pb-4">
						{options.map((o) => (
							<button
								key={o.value}
								type="button"
								aria-pressed={o.value === value}
								onClick={() => {
									onChange(o.value);
									setOpen(false);
								}}
								className="flex min-h-11 items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted"
							>
								<span className="min-w-0 flex-1">{o.label}</span>
								{o.value === value && <Check className="size-4 text-primary" />}
							</button>
						))}
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
};
