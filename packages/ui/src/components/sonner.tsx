import type * as React from "react";
import { Toaster as SonnerToaster, toast, useSonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

// --toast-bottom is the app's measured clearance above its fixed bottom controls.
const TOAST_OFFSET = {
	bottom: "var(--toast-bottom, calc(var(--safe-bottom, 0px) + 12px))",
};

function Toaster({ ...props }: ToasterProps) {
	return (
		<SonnerToaster
			data-slot="sonner"
			theme="system"
			className="toaster group"
			position="bottom-center"
			expand
			gap={8}
			swipeDirections={["bottom", "left", "right"]}
			offset={TOAST_OFFSET}
			mobileOffset={TOAST_OFFSET}
			style={{ "--width": "380px" } as React.CSSProperties}
			{...props}
		/>
	);
}

export { Toaster, toast, useSonner };
