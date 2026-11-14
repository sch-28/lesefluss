import { Slider as SliderPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

function Slider({
	className,
	thumbProps,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
	/** e.g. `aria-label` / `aria-valuetext`, which belong on the thumb, the element with role="slider". */
	thumbProps?: React.ComponentProps<typeof SliderPrimitive.Thumb>;
}) {
	return (
		<SliderPrimitive.Root
			data-slot="slider"
			className={cn(
				// On touch, a 44px band takes taps on the 6px track; the thumb gets its own in tokens.css.
				"relative flex w-full touch-none select-none items-center pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:top-1/2 pointer-coarse:before:h-11 pointer-coarse:before:-translate-y-1/2 pointer-coarse:before:content-[''] data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
			>
				<SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb
				{...thumbProps}
				data-slot="slider-thumb"
				className="block size-4 rounded-full border-2 border-primary bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
			/>
		</SliderPrimitive.Root>
	);
}

export { Slider };
