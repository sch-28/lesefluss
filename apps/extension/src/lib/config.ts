export const LESEFLUSS_URL = (
	import.meta.env.WXT_PUBLIC_LESEFLUSS_URL ?? "https://lesefluss.app"
).replace(/\/$/, "");

export function apiUrl(path: string): string {
	return `${LESEFLUSS_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
