import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

function Toaster({ ...props }: ToasterProps) {
	return (
		<SonnerToaster
			data-slot="sonner"
			theme="system"
			className="toaster group"
			position="top-center"
			offset="calc(var(--safe-top) + 16px)"
			mobileOffset="calc(var(--safe-top) + 16px)"
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
