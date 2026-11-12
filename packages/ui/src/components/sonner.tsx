import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

const TOAST_OFFSET = {
	top: "calc(var(--safe-top) + 3.5rem)",
	bottom: "calc(var(--tab-bar-h, 0px) + var(--safe-bottom, 0px) + 0.5rem)",
};

function Toaster({ ...props }: ToasterProps) {
	return (
		<SonnerToaster
			data-slot="sonner"
			theme="system"
			className="toaster group"
			position="top-center"
			// Below the 3rem page and reader header rows (above the tab bar for a bottom toast), so a toast never covers their buttons.
			offset={TOAST_OFFSET}
			mobileOffset={TOAST_OFFSET}
			style={
				{
					"--width": "min(92vw, 380px)",
					"--mobile-width": "min(92vw, 380px)",
				} as React.CSSProperties
			}
			// Sonner's own icons are unlabelled SVG images to screen readers; lucide's are aria-hidden.
			icons={{
				success: <CircleCheck className="size-4" />,
				error: <CircleX className="size-4" />,
				info: <Info className="size-4" />,
				warning: <TriangleAlert className="size-4" />,
				loading: <Loader2 className="size-4 animate-spin" />,
			}}
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-muted-foreground",
					actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
				},
			}}
			{...props}
		/>
	);
}

export { Toaster, toast };
