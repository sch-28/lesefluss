import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const CHROME_EXTENSION_KEY =
	"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5a/V2hpWy9osFTYAflcewAJ9GVa1dvEekmrCMm2/Py/YLhWQN8MCZ5DMWIpUv9KdaqXEgFX14OzTKCsT0ZmR7ZAYkTayG2hPOeDUvxdotQoI0louarH/LF7bkfouAEW/Pop4dt4TnbuWO3clPaP7fAsuBcdOdPTygx7fCYDmD6XGhqeZVg4NxyvGwlJFAl6hosvIh0GIOPwvwhwm06DZ2YkS6lTsk+4FxblICv+OJ+GiLy8oHFKUjXGfI15va9dUe2AYzI/D/sBvHuUWoyyOqSXeIkjNc4c52Sqy4O9TjeGim1wKIssxphEbcZQVFoAFejBbLZw97/sH0YG8dg2pGwIDAQAB";
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
		permissions: ["identity", "storage", "contextMenus", "notifications", "activeTab"],
		host_permissions: [
			hostPermissionFor(process.env.WXT_PUBLIC_LESEFLUSS_URL ?? DEFAULT_LESEFLUSS_URL),
			...(mode === "production" ? [] : ["http://localhost/*"]),
		],
		...(browser === "chrome" ? { key: CHROME_EXTENSION_KEY } : {}),
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
