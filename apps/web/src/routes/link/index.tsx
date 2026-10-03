import { formatDeviceLinkCode, isDeviceLinkCode, normalizeDeviceLinkCode } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Field, FieldLabel } from "@lesefluss/ui/field";
import { Input } from "@lesefluss/ui/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { type DeviceLinkDecision, type DeviceLinkState, decideDeviceLink } from "~/lib/device-link";
import { useAuthSession } from "~/lib/session-context";
import { seo } from "~/utils/seo";

function codeFromSearch(value: unknown): string | undefined {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const code = normalizeDeviceLinkCode(String(value));
	return code === "" ? undefined : code;
}

export const Route = createFileRoute("/link/")({
	// better-auth puts the code in `user_code`; `code` is the short form for typing the URL.
	validateSearch: (search: Record<string, unknown>): { user_code?: string } => {
		const code = codeFromSearch(search.user_code) ?? codeFromSearch(search.code);
		return code ? { user_code: code } : {};
	},
	head: () => seo({ title: "Sign in another device - Lesefluss", isNoindex: true }),
	component: LinkDevicePage,
});

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm space-y-6 text-center">
				<h1 className="font-bold text-2xl tracking-tight">{title}</h1>
				{children}
			</div>
		</div>
	);
}

const OUTCOME_COPY: Record<DeviceLinkState, { title: string; body: string }> = {
	approved: {
		title: "Done",
		body: "Your other device is signing in now. You can close this page.",
	},
	denied: {
		title: "Denied",
		body: "That device stays signed out. Nothing else was changed.",
	},
	invalid: {
		title: "That code didn't match",
		body: "Check the code shown in the app and try again. It may already have been used.",
	},
	expired: {
		title: "That code has expired",
		body: "Codes last ten minutes. Ask the app for a new one and try again.",
	},
	"already-used": {
		title: "That code was already used",
		body: "Each code works once. Ask the app for a new one if it is still signed out.",
	},
	"signed-out": {
		title: "You were signed out",
		body: "Sign in again, then enter the code once more.",
	},
	"rate-limited": {
		title: "Too many attempts",
		body: "Wait a minute, then try the code again.",
	},
};

function ConfirmForm({
	initialCode,
	email,
	onOutcome,
}: {
	initialCode: string | undefined;
	email: string;
	onOutcome: (state: DeviceLinkState) => void;
}) {
	const [code, setCode] = React.useState(initialCode ? formatDeviceLinkCode(initialCode) : "");
	const [isDeviceInFront, setIsDeviceInFront] = React.useState(false);
	const [pending, setPending] = React.useState<DeviceLinkDecision | null>(null);
	const [hint, setHint] = React.useState<string | null>(null);

	const handleDecision = async (decision: DeviceLinkDecision) => {
		if (!isDeviceLinkCode(normalizeDeviceLinkCode(code))) {
			setHint("Enter the 8-character code shown in the app.");
			return;
		}
		setPending(decision);
		setHint(null);
		try {
			onOutcome(await decideDeviceLink({ data: { code, decision } }));
		} catch {
			setHint("Something went wrong. Please try again.");
			setPending(null);
		}
	};

	const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setCode(e.target.value.toUpperCase());
		setHint(null);
	};

	return (
		<div className="space-y-4 text-left">
			<p className="text-center text-muted-foreground text-sm">
				This signs in the device showing the code as{" "}
				<span className="font-medium text-foreground">{email}</span>.
			</p>
			<Field>
				<FieldLabel htmlFor="device-link-code">Code from the app</FieldLabel>
				<Input
					id="device-link-code"
					value={code}
					onChange={handleCodeChange}
					placeholder="ABCD-2345"
					autoComplete="off"
					autoCapitalize="characters"
					spellCheck={false}
					className="text-center font-mono text-lg tracking-[0.2em]"
					disabled={pending !== null}
				/>
			</Field>
			{/* Device-code phishing: a stranger can request a code and send the link.
			    The code alone must not be enough to approve. */}
			<label className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
				<input
					type="checkbox"
					className="mt-0.5 size-4 shrink-0"
					checked={isDeviceInFront}
					onChange={(e) => setIsDeviceInFront(e.target.checked)}
					disabled={pending !== null}
				/>
				<span>
					The device showing this code is in front of me. I did not get this code or link from
					someone else.
				</span>
			</label>
			{hint && <p className="text-destructive text-sm">{hint}</p>}
			<Button
				type="button"
				className="w-full"
				disabled={pending !== null || !isDeviceInFront}
				onClick={() => handleDecision("approve")}
			>
				{pending === "approve" ? "Signing in…" : "Sign in that device"}
			</Button>
			<Button
				type="button"
				variant="ghost"
				className="w-full"
				disabled={pending !== null}
				onClick={() => handleDecision("deny")}
			>
				{pending === "deny" ? "Denying…" : "Not me, deny"}
			</Button>
		</div>
	);
}

function LinkDevicePage() {
	const session = useAuthSession();
	const { user_code: code } = Route.useSearch();
	const [outcome, setOutcome] = React.useState<DeviceLinkState | null>(null);

	if (!session?.user) {
		const redirect = code ? `/link?user_code=${code}` : "/link";
		return (
			<Shell title="Sign in another device">
				<p className="text-muted-foreground text-sm">
					Sign in here first. The code from the app is kept, you only confirm it afterwards.
				</p>
				<Button asChild className="w-full">
					<Link to="/login" search={{ redirect }}>
						Sign in
					</Link>
				</Button>
			</Shell>
		);
	}

	if (outcome) {
		const copy = OUTCOME_COPY[outcome];
		return (
			<Shell title={copy.title}>
				<p className="text-muted-foreground text-sm">{copy.body}</p>
				{outcome !== "approved" && outcome !== "denied" && (
					<Button variant="outline" className="w-full" onClick={() => setOutcome(null)}>
						Try another code
					</Button>
				)}
			</Shell>
		);
	}

	return (
		<Shell title="Sign in another device">
			<ConfirmForm initialCode={code} email={session.user.email} onOutcome={setOutcome} />
		</Shell>
	);
}
