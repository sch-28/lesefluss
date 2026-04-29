import type { ProviderId } from "../../services/serial-scrapers";
import rawCovers from "./provider-covers.json";

export type ProviderCover = {
	slug: string;
	title: string;
	coverUrl: string;
};

type RawCover = { provider: string; slug: string; title: string; file: string };

function buildProviderCovers(): Partial<Record<ProviderId, ProviderCover[]>> {
	const grouped: Partial<Record<ProviderId, ProviderCover[]>> = {};
	for (const c of rawCovers as RawCover[]) {
		const id = c.provider as ProviderId;
		const list = grouped[id] ?? [];
		list.push({ slug: c.slug, title: c.title, coverUrl: `/covers/providers/${c.file}` });
		grouped[id] = list;
	}
	return grouped;
}

export const providerCovers: Partial<Record<ProviderId, ProviderCover[]>> = buildProviderCovers();
