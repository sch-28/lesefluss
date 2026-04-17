import { SITE_URL } from "./seo";

export type JsonLdScript = { type: "application/ld+json"; children: string };

export function jsonLd(data: Record<string, unknown>): JsonLdScript {
	return { type: "application/ld+json", children: JSON.stringify(data) };
}

export const webSiteSchema = jsonLd({
	"@context": "https://schema.org",
	"@type": "WebSite",
	name: "Lesefluss",
	url: SITE_URL,
	description:
		"Speed reading app for Android with an optional pocket-sized ESP32 device. Import EPUB and TXT, read at up to 1000 WPM.",
});

export function buildOrganizationSchema(hideGithub = false): JsonLdScript {
	return jsonLd({
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "Lesefluss",
		url: SITE_URL,
		logo: `${SITE_URL}/android-chrome-512x512.png`,
		...(hideGithub ? {} : { sameAs: ["https://github.com/sch-28/lesefluss"] }),
	});
}

export const softwareApplicationSchema = jsonLd({
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Lesefluss",
	applicationCategory: "BookApplication",
	operatingSystem: "Android, Web",
	url: SITE_URL,
	image: `${SITE_URL}/og.png`,
	description:
		"Read books 2–4× faster with RSVP. Import EPUB and TXT, sync settings to a pocket-sized ESP32 device, and read fully offline.",
	offers: {
		"@type": "Offer",
		price: "0",
		priceCurrency: "EUR",
	},
	publisher: {
		"@type": "Organization",
		name: "Lesefluss",
		url: SITE_URL,
	},
});

export function faqPageSchema(items: Array<{ q: string; a: string }>): JsonLdScript {
	return jsonLd({
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map(({ q, a }) => ({
			"@type": "Question",
			name: q,
			acceptedAnswer: { "@type": "Answer", text: a },
		})),
	});
}
