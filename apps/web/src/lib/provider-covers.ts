import rawCovers from "./provider-covers.json";

export type ProviderId = "ao3" | "royalroad" | "scribblehub" | "wuxiaworld";

export type ProviderCover = {
	slug: string;
	title: string;
	coverUrl: string;
};

type RawCover = { provider: string; slug: string; title: string; file: string };

const PROVIDER_IDS: ReadonlySet<ProviderId> = new Set([
	"ao3",
	"royalroad",
	"scribblehub",
	"wuxiaworld",
]);

function isProviderId(s: string): s is ProviderId {
	return (PROVIDER_IDS as Set<string>).has(s);
}

function buildProviderCovers(): Record<ProviderId, ProviderCover[]> {
	const grouped: Record<ProviderId, ProviderCover[]> = {
		ao3: [],
		royalroad: [],
		scribblehub: [],
		wuxiaworld: [],
	};
	for (const c of rawCovers as RawCover[]) {
		if (isProviderId(c.provider)) {
			grouped[c.provider].push({
				slug: c.slug,
				title: c.title,
				coverUrl: `/covers/providers/${c.file}`,
			});
		}
	}
	return grouped;
}

export const providerCovers: Record<ProviderId, ProviderCover[]> = buildProviderCovers();
