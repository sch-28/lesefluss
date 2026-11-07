import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BurstStrip } from "./burst-strip";
import { useBurstSession } from "./open-burst";

const EDGE = 16;

/** Mounted once at the app root: the burst strip in its pop-up, or floating in the tab. */
export function BurstHost() {
	const session = useBurstSession();
	if (!session) return null;
	if (session.host === "pip") {
		return createPortal(
			<BurstStrip key={session.id} bookId={session.bookId} host="pip" win={session.window} />,
			session.window.document.body,
		);
	}
	return <FloatingStrip key={session.id} bookId={session.bookId} />;
}

/** Firefox and Safari have no Document Picture-in-Picture: a draggable strip over the page. */
function FloatingStrip({ bookId }: { bookId: string | null }) {
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const dragRef = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
	return (
		<div
			className="fixed z-[60]"
			style={{ right: EDGE - offset.x, bottom: EDGE - offset.y }}
			onPointerDown={(e) => {
				if (!(e.target instanceof Element) || !e.target.closest("[data-burst-grip]")) return;
				e.currentTarget.setPointerCapture(e.pointerId);
				dragRef.current = { x: e.clientX, y: e.clientY, from: offset };
			}}
			onPointerMove={(e) => {
				const drag = dragRef.current;
				if (!drag) return;
				setOffset({ x: drag.from.x + e.clientX - drag.x, y: drag.from.y + e.clientY - drag.y });
			}}
			onPointerUp={() => {
				dragRef.current = null;
			}}
			onPointerCancel={() => {
				dragRef.current = null;
			}}
		>
			<BurstStrip bookId={bookId} host="tab" win={window} />
		</div>
	);
}
