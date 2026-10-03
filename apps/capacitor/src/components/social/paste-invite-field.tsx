import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { parsePastedInvite } from "@/services/deep-links/parse";

/** Opens an invite link someone sent, pasted as is or inside a longer message. */
export function PasteInviteField({ className }: { className?: string }) {
	const navigate = useNavigate();
	const [pasted, setPasted] = useState("");
	const [hint, setHint] = useState<string | null>(null);

	const openPasted = () => {
		const parsed = parsePastedInvite(pasted);
		if (!parsed) {
			setHint("That doesn't look like a Lesefluss invite link.");
			return;
		}
		setHint(null);
		navigate({ to: "/tabs/social/invite/$token", params: { token: parsed.token } });
	};

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex gap-2">
				<Input
					value={pasted}
					onChange={(e) => {
						setPasted(e.target.value);
						setHint(null);
					}}
					placeholder="https://lesefluss.app/invite/…"
					aria-label="Invite link you received"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
				/>
				<Button variant="outline" disabled={pasted.trim() === ""} onClick={openPasted}>
					Open
				</Button>
			</div>
			{hint && <p className="m-0 text-destructive text-xs">{hint}</p>}
		</div>
	);
}
