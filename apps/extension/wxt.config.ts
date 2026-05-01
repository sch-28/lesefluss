import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const CHROME_EXTENSION_KEY =
	"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqVfUxbZJ3HlYYpHDtQln1xBTPHkgV2csVbQDcYxZ0F8Usas87QaMNn9LU1nGiTH7aXEkviNFk7tIpMZkZdC8jWpLW6hm+KHGODm7JlrzYtB8Ty32i0Dy5di+PUhb+/E9A0VH6Jy1EJFyicrX9yx2U9ZcajLfahomL69ewnLIdD4MNTIYMLwNdebHsA34xZcIBTOXkBmxspKkfbxn7ZOe8aC7Z66BcSE5FbHYFO/C7y+HlQmUmOqFWvHHuupwpPhRMwOMQrSINJ63o9cdsvzTN78JAvxLzN5eFrCUeSXL3SyTPsbIsxM0zPrGD8VKRpOIGaUgIIUB14VCCkq0hLR7oQIDAQAB";
const FIREFOX_EXTENSION_ID = "{33eb4261-e623-4961-aadf-99d982f2c082}";
const DEFAULT_LESEFLUSS_URL = "https://lesefluss.app";

function hostPermissionFor(url: string): string {
	const origin = new URL(url).origin;
	return `${origin}/*`;
}

export default defineConfig({
	imports: false,
	modules: ["@wxt-dev/module-react"],
	manifest: ({ browser, mode }) => ({
		name: "Lesefluss",
		short_name: "Lesefluss",
		description: "Save articles from the web to your Lesefluss library.",
		permissions: ["identity", "storage", "contextMenus", "notifications", "activeTab", "scripting"],
		host_permissions: [
			hostPermissionFor(process.env.WXT_PUBLIC_LESEFLUSS_URL ?? DEFAULT_LESEFLUSS_URL),
			...(mode === "production" ? [] : ["http://localhost/*"]),
		],
		// Chrome Web Store rejects manifests that include a `key`. We only need
		// it locally to keep the dev extension ID stable; production builds are
		// uploaded to the store, which assigns its own ID on first publish.
		...(browser === "chrome" && mode !== "production" ? { key: CHROME_EXTENSION_KEY } : {}),
		...(browser === "firefox"
			? {
					browser_specific_settings: {
						gecko: {
							id: FIREFOX_EXTENSION_ID,
							data_collection_permissions: {
								required: ["websiteContent", "authenticationInfo"],
							},
						},
					},
				}
			: {}),
	}),
	vite: () => ({
		plugins: [tailwindcss()],
	}),
});
