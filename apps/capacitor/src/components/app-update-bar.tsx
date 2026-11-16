import { X } from "lucide-react";
import { useState } from "react";
import { createFlag } from "@/commands/signal";
import { applyUpdate, appUpdateReady } from "@/services/app-update";
import { tabBarHidden } from "./app-shell/tab-bar-visibility";

const dismissed = createFlag();

/**
 * Offers the reload into a new build. It lives in the app shell, which the
 * reader does not render, so it waits until the open book is closed.
 */
export function AppUpdateBar() {
	const ready = appUpdateReady.useValue();
	const isDismissed = dismissed.useValue();
	// A screen's own bottom bar (library selection) has the place; the bar returns after.
	const bottomTaken = tabBarHidden.useValue();
	const [reloading, setReloading] = useState(false);
	if (!ready || isDismissed || bottomTaken) return null;
	return (
		<div
			role="status"
			// 5rem clears the library's add button (size-14 at the tab bar + 1rem) on phones.
			className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-h)+var(--safe-bottom)+5rem)] z-40 flex justify-center px-3 md:bottom-4 md:pl-[calc(var(--side-nav-w)+0.75rem)]"
		>
			<div
				data-toast-clear
				className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl bg-foreground py-1.5 pr-1.5 pl-4 text-background shadow-lg"
			>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-sm">A new version is ready</p>
					<p className="text-xs opacity-75">Your place is saved.</p>
				</div>
				<button
					type="button"
					disabled={reloading}
					onClick={() => {
						setReloading(true);
						applyUpdate().catch(() => setReloading(false));
					}}
					className="h-11 shrink-0 rounded-lg bg-background px-4 font-semibold text-foreground text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
				>
					{reloading ? "Reloading…" : "Reload"}
				</button>
				<button
					type="button"
					aria-label="Dismiss"
					onClick={() => dismissed.set(true)}
					className="flex size-11 shrink-0 items-center justify-center rounded-lg opacity-75 transition-opacity hover:opacity-100"
				>
					<X className="size-5" aria-hidden />
				</button>
			</div>
		</div>
	);
}
