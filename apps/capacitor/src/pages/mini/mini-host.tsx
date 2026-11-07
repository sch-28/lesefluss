import { createPortal } from "react-dom";
import { MiniWindow } from "./mini-window";
import { useMiniSession } from "./open-mini";

/** Mounted once at the app root: the mini window's Picture-in-Picture document. */
export function MiniHost() {
	const session = useMiniSession();
	if (session?.host !== "pip") return null;
	return createPortal(
		<MiniWindow key={session.id} port={session.mini} win={session.window} host="pip" />,
		session.window.document.body,
	);
}
