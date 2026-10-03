import { Button } from "@lesefluss/ui/button";
import { toast as sonnerToast } from "@lesefluss/ui/sonner";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string }>;

type PromptToastOptions = {
	icon: IconComponent;
	title: string;
	body: string;
	primaryLabel: string;
	primaryIcon?: IconComponent;
	secondaryLabel: string;
	onPrimary: () => void;
	onSecondary: () => void;
};

/** A toast that stays until the user picks one of its two actions. */
export function showPromptToast(opts: PromptToastOptions): void {
	const { icon: Icon, primaryIcon: PrimaryIcon } = opts;
	sonnerToast.custom(
		(id) => (
			<div className="flex w-full items-start gap-3 rounded-lg border border-border bg-popover p-4 shadow-lg">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<Icon className="size-5" />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-3">
					<div className="flex flex-col gap-0.5">
						<p className="font-semibold text-foreground text-sm">{opts.title}</p>
						<p className="text-muted-foreground text-xs">{opts.body}</p>
					</div>
					<div className="flex items-center justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								opts.onSecondary();
								sonnerToast.dismiss(id);
							}}
						>
							{opts.secondaryLabel}
						</Button>
						<Button
							variant="default"
							size="sm"
							onClick={() => {
								opts.onPrimary();
								sonnerToast.dismiss(id);
							}}
						>
							{PrimaryIcon && <PrimaryIcon />}
							{opts.primaryLabel}
						</Button>
					</div>
				</div>
			</div>
		),
		{ duration: Number.POSITIVE_INFINITY },
	);
}
