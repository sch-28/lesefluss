import type * as React from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";

/**
 * An icon action in a page header: a 32px ghost button with a 20px glyph and a 44px hit area.
 * It stays 32px wide so a phone header fits its actions at 390px.
 */
function HeaderAction({
	className,
	...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & { "aria-label": string }) {
	return (
		<Button
			variant="ghost"
			size="icon"
			data-slot="header-action"
			className={cn("[&_svg:not([class*='size-'])]:size-5", className)}
			{...props}
		/>
	);
}

export { HeaderAction };
