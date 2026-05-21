import { useBookDeviceState } from "../../contexts/device-library-context";

type DeviceBadgeProps = {
	bookId: string;
	/**
	 * Visual variant.
	 * - `inline` (default): pill positioned absolutely in a card corner.
	 * - `block`: stacked uppercase label for list rows.
	 * - `text`: plain text span that callers can compose into their own line.
	 */
	style?: "inline" | "block" | "text";
};

/**
 * Per-book "on device" badge driven by live device state. Renders the
 * "Reading on device" variant when the connected device is currently showing
 * this book, the neutral "On device" variant when the book is present but
 * inactive, and nothing when disconnected or absent.
 */
export function DeviceBadge({ bookId, style = "inline" }: DeviceBadgeProps) {
	const state = useBookDeviceState(bookId);
	if (!state.isReachable || !state.isOnDevice) {
		return null;
	}
	const label = state.isActiveOnDevice ? "Reading on device" : "On device";

	if (style === "text") {
		return <span className={state.isActiveOnDevice ? "text-accent" : "text-primary"}>{label}</span>;
	}

	if (style === "block") {
		return (
			<div
				className={
					state.isActiveOnDevice
						? "mt-0.5 font-semibold text-[0.7rem] text-accent uppercase tracking-wide"
						: "mt-0.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wide"
				}
			>
				{label}
			</div>
		);
	}

	return (
		<span
			className={
				state.isActiveOnDevice
					? "absolute right-1.5 bottom-1.5 rounded-sm bg-accent px-1.5 py-0.5 font-semibold text-[0.6rem] text-accent-foreground"
					: "absolute right-1.5 bottom-1.5 rounded-sm bg-foreground px-1.5 py-0.5 font-semibold text-[0.6rem] text-background"
			}
		>
			{label}
		</span>
	);
}
