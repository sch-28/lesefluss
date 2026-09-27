import { createFileRoute } from "@tanstack/react-router";

// Android App Links verification for https://lesefluss.app/invite/*. One entry
// per signing key: the local release keystore (sideloaded APKs) and the Play
// App Signing key (Play installs). See docs/deep-links.md for how to obtain them.
const SIGNING_KEY_FINGERPRINTS = [
	"04:D5:E3:B4:BB:9B:5F:9E:20:47:5A:32:D1:40:32:9E:2C:32:E4:EA:E8:BA:94:E6:1A:42:27:8F:18:BE:49:B7",
	...(process.env.PLAY_APP_SIGNING_SHA256 ? [process.env.PLAY_APP_SIGNING_SHA256] : []),
];

const body = JSON.stringify([
	{
		relation: ["delegate_permission/common.handle_all_urls"],
		target: {
			namespace: "android_app",
			package_name: "app.lesefluss",
			sha256_cert_fingerprints: SIGNING_KEY_FINGERPRINTS,
		},
	},
]);

export const Route = createFileRoute("/.well-known/assetlinks.json")({
	server: {
		handlers: {
			GET: () =>
				new Response(body, {
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": "public, max-age=3600",
					},
				}),
		},
	},
});
