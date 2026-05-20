import { Toaster as SonnerToaster, toast } from "sonner";
import type * as React from "react";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

function Toaster({ ...props }: ToasterProps) {
	return (
		<SonnerToaster
			data-slot="sonner"
			theme="system"
			className="toaster group"
			position="top-center"
			offset="calc(env(safe-area-inset-top) + 16px)"
			mobileOffset="calc(env(safe-area-inset-top) + 16px)"
			style={
				{
					"--width": "min(92vw, 380px)",
					"--mobile-width": "min(92vw, 380px)",
				} as React.CSSProperties
			}
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
