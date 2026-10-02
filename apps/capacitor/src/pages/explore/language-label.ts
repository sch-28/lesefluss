const languageNames = (() => {
	try {
		return new Intl.DisplayNames(["en"], { type: "language" });
	} catch {
		return null;
	}
})();

export function languageLabel(code: string): string {
	if (code === "all") return "All languages";
	try {
		return languageNames?.of(code) ?? code.toUpperCase();
	} catch {
		return code.toUpperCase();
	}
}
