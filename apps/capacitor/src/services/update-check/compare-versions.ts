export function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const da = pa[i] ?? 0;
		const db = pb[i] ?? 0;
		if (da !== db) return da > db ? 1 : -1;
	}
	return 0;
}

export function shouldPromptUpdate(
	current: string,
	latest: string | null | undefined,
	mutedVersion: string | null,
): latest is string {
	if (!latest) return false;
	if (compareVersions(latest, current) <= 0) return false;
	if (mutedVersion === latest) return false;
	return true;
}
