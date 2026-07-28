import { Button } from "@lesefluss/ui/button";
import { toast as sonnerToast } from "@lesefluss/ui/sonner";
import { ArrowUp, Download } from "lucide-react";

type UpdateToastProps = {
	version: string;
	onUpdate: () => void;
	onHide: () => void;
};

function UpdateToastCard({ version, onUpdate, onHide }: UpdateToastProps) {
	return (
		<div className="flex w-full items-start gap-3 rounded-lg border border-border bg-popover p-4 shadow-lg">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
				<ArrowUp className="size-5" />
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<div className="flex flex-col gap-0.5">
					<p className="font-semibold text-foreground text-sm">Update available</p>
					<p className="text-muted-foreground text-xs">
						Version {version} is ready to install with the latest fixes.
					</p>
				</div>
				<div className="flex items-center justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onHide}>
						Hide
					</Button>
					<Button variant="default" size="sm" onClick={onUpdate}>
						<Download />
						Update
					</Button>
				</div>
			</div>
		</div>
	);
}

export function showUpdateToast(opts: {
	version: string;
	onUpdate: () => void;
	onHide: () => void;
}): void {
	sonnerToast.custom(
		(id) => (
			<UpdateToastCard
				version={opts.version}
				onUpdate={() => {
					opts.onUpdate();
					sonnerToast.dismiss(id);
				}}
				onHide={() => {
					opts.onHide();
					sonnerToast.dismiss(id);
				}}
			/>
		),
		{ duration: Number.POSITIVE_INFINITY },
	);
}
