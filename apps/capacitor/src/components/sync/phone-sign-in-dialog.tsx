import { formatDeviceLinkCode } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { useEffect, useMemo } from "react";
import { encode } from "uqr";
import { Modal } from "@/components/modal";
import { useDeviceSignIn } from "./use-device-sign-in";

const QR_QUIET_ZONE = 2;

function linkHost(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.host}${parsed.pathname}`;
	} catch {
		return url;
	}
}

/** One path covering every dark module, drawn as unit squares. */
function qrPath(url: string): { d: string; size: number } {
	const { data, size } = encode(url);
	let d = "";
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (data[y]?.[x]) d += `M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`;
		}
	}
	return { d, size: size + QR_QUIET_ZONE * 2 };
}

/**
 * Shows a device-link code as text and QR and signs the app in once a
 * signed-in browser confirms it. Static black-on-white so it reads on e-ink.
 */
export function PhoneSignInDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { state, restart } = useDeviceSignIn(open);
	const liveGrant = state.phase === "waiting" || state.phase === "finishing" ? state.grant : null;
	const verificationUrl = liveGrant?.verificationUrl;

	useEffect(() => {
		if (state.phase === "done") onOpenChange(false);
	}, [state.phase, onOpenChange]);

	const qr = useMemo(() => (verificationUrl ? qrPath(verificationUrl) : null), [verificationUrl]);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Sign in with your phone"
			description="Scan the code with your phone's camera, or open the link on any device where you are signed in, and confirm there."
			footer={
				<>
					{state.phase === "failed" && <Button onClick={restart}>New code</Button>}
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
				</>
			}
		>
			{state.phase === "requesting" && (
				<p className="m-0 text-center text-muted-foreground text-sm">Getting a code…</p>
			)}
			{liveGrant && qr && (
				<div className="flex flex-col items-center gap-3">
					<svg
						className="w-44 rounded bg-white"
						viewBox={`0 0 ${qr.size} ${qr.size}`}
						shapeRendering="crispEdges"
						role="img"
						aria-label="QR code for the sign-in link"
						data-testid="device-link-qr"
					>
						<path d={qr.d} fill="#000000" />
					</svg>
					<p className="m-0 font-mono text-2xl tracking-[0.2em]">
						{formatDeviceLinkCode(liveGrant.userCode)}
					</p>
					<p className="m-0 text-center text-muted-foreground text-xs">
						Or open{" "}
						<span className="font-medium text-foreground">
							{linkHost(liveGrant.verificationUrl)}
						</span>{" "}
						and type the code. It works for ten minutes.
					</p>
				</div>
			)}
			{state.phase === "waiting" && (
				<p className="m-0 text-center text-muted-foreground text-sm">Waiting for confirmation…</p>
			)}
			{state.phase === "finishing" && (
				<p className="m-0 text-center text-muted-foreground text-sm">Confirmed. Signing in…</p>
			)}
			{state.phase === "failed" && (
				<p className="m-0 text-center text-destructive text-sm">{state.message}</p>
			)}
		</Modal>
	);
}
