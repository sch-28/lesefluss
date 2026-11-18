const COUNT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** The app's one count format, the same whatever the device locale: "12,345". */
export function formatCount(n: number): string {
	return COUNT_FORMAT.format(n);
}
