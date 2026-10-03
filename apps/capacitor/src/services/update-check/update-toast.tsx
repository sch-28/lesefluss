import { ArrowUp, Download } from "lucide-react";
import { showPromptToast } from "@/components/prompt-toast";

export function showUpdateToast(opts: {
	version: string;
	onUpdate: () => void;
	onHide: () => void;
}): void {
	showPromptToast({
		icon: ArrowUp,
		title: "Update available",
		body: `Version ${opts.version} is ready to install with the latest fixes.`,
		primaryLabel: "Update",
		primaryIcon: Download,
		secondaryLabel: "Hide",
		onPrimary: opts.onUpdate,
		onSecondary: opts.onHide,
	});
}
