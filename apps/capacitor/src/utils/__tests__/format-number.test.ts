import { afterEach, describe, expect, it, vi } from "vitest";

const realToLocaleString = Number.prototype.toLocaleString;
const realToLocaleDateString = Date.prototype.toLocaleDateString;

/** A German device: every formatter that leaves the locale to the device gets de-DE. */
function stubGermanDevice() {
	const RealNumberFormat = Intl.NumberFormat;
	const RealDateTimeFormat = Intl.DateTimeFormat;
	const intl = Object.create(Intl);
	intl.NumberFormat = class extends RealNumberFormat {
		constructor(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
			super(locales ?? "de-DE", options);
		}
	};
	intl.DateTimeFormat = class extends RealDateTimeFormat {
		constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
			super(locales ?? "de-DE", options);
		}
	};
	vi.stubGlobal("Intl", intl);
	Number.prototype.toLocaleString = function (
		this: number,
		locales?: Intl.LocalesArgument,
		options?: Intl.NumberFormatOptions,
	) {
		return realToLocaleString.call(this, locales ?? "de-DE", options);
	};
	Date.prototype.toLocaleDateString = function (
		this: Date,
		locales?: Intl.LocalesArgument,
		options?: Intl.DateTimeFormatOptions,
	) {
		return realToLocaleDateString.call(this, locales ?? "de-DE", options);
	};
	vi.resetModules();
}

afterEach(() => {
	vi.unstubAllGlobals();
	Number.prototype.toLocaleString = realToLocaleString;
	Date.prototype.toLocaleDateString = realToLocaleDateString;
});

describe("the app's one locale on a German device", () => {
	it("groups counts with a comma", async () => {
		stubGermanDevice();
		const { formatCount } = await import("../format-number");
		expect(formatCount(12345)).toBe("12,345");
		expect(formatCount(1234567.6)).toBe("1,234,568");
		expect(formatCount(0)).toBe("0");
	});

	it("names days, months and weekdays in English", async () => {
		stubGermanDevice();
		const { formatDayMonth, formatMonth, formatWeekdayTime } = await import("../date-utils");
		const tuesday = new Date(2026, 10, 17, 14, 5).getTime();
		expect(formatDayMonth(tuesday)).toBe("Nov 17");
		expect(formatMonth(tuesday, { month: "long" })).toBe("November");
		expect(formatMonth(tuesday, { month: "short", year: "numeric" })).toBe("Nov 2026");
		expect(formatWeekdayTime(tuesday)).toBe("Tue 14:05");
	});
});

describe("formatCompactCount", () => {
	it("reads the same for every compact count, with one decimal only on small values", async () => {
		const { formatCompactCount } = await import("../format-number");
		expect(
			[0, 640, 999, 1000, 1200, 12_500, 99_999, 100_000, 150_000, 999_999].map(formatCompactCount),
		).toEqual(["0", "640", "999", "1k", "1.2k", "12.5k", "99.9k", "100k", "150k", "999k"]);
		expect(
			[1_000_000, 1_250_000, 9_990_000, 10_000_000, 12_600_000].map(formatCompactCount),
		).toEqual(["1M", "1.2M", "9.9M", "10M", "12M"]);
	});
});
