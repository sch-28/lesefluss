import { Capacitor } from "@capacitor/core";

/** True when running in a browser (not inside a native Capacitor WebView). */
export const IS_WEB = Capacitor.getPlatform() === "web";
