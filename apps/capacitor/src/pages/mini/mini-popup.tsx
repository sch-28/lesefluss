import ReactDOM from "react-dom/client";
import { createChannelPort, type FromMini, type MiniPort, type ToMini } from "./mini-bridge";
import { MiniWindow } from "./mini-window";

/**
 * The popup tier boots this instead of the app: no database (the one-tab lock
 * belongs to the reader tab), no router, no sync. Every word comes over the channel.
 */
export function bootMiniPopup(root: HTMLElement): void {
	const session = new URLSearchParams(window.location.search).get("s") ?? "";
	const port: MiniPort = createChannelPort<ToMini, FromMini>(session, "mini");
	ReactDOM.createRoot(root).render(<MiniWindow port={port} win={window} host="popup" />);
}

export function isMiniPopupPath(pathname: string, base: string): boolean {
	return pathname.replace(/\/$/, "") === `${base.replace(/\/?$/, "/")}mini`;
}
