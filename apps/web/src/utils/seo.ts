export const SITE_URL = "https://lesefluss.app";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og.png`;

export function buildVerificationMeta() {
	const tags: Array<{ name: string; content: string }> = [];
	if (process.env.GOOGLE_SITE_VERIFICATION) {
		tags.push({ name: "google-site-verification", content: process.env.GOOGLE_SITE_VERIFICATION });
	}
	if (process.env.BING_SITE_VERIFICATION) {
		tags.push({ name: "msvalidate.01", content: process.env.BING_SITE_VERIFICATION });
	}
	return tags;
}

export const seo = ({
	title,
	description,
	image,
	path,
	isNoindex,
}: {
	title: string;
	description?: string;
	image?: string;
	path?: string;
	isNoindex?: boolean;
}) => {
	const ogImage = image ?? DEFAULT_OG_IMAGE;
	const url = `${SITE_URL}${path ?? ""}`;
	const shouldCanonical = !isNoindex && path !== undefined;

	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			{ name: "robots", content: isNoindex ? "noindex, nofollow" : "index, follow" },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Lesefluss" },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: url },
			{ property: "og:image", content: ogImage },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: ogImage },
		],
		links: shouldCanonical ? [{ rel: "canonical", href: url }] : [],
	};
};
