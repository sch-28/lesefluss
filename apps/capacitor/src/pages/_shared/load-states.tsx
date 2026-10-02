import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { AlertCircle, ExternalLink, Frown, WifiOff } from "lucide-react";
import type React from "react";
import { useIsOnline } from "../../services/social/cache";
import { isNetworkError } from "../../utils/network-error";

export type LoadErrorKind = "offline" | "network" | "server";

/** Classify a failed load without echoing `error.message` to the user. */
export function describeLoadError(error: unknown, isOnline: boolean): LoadErrorKind {
	if (!isOnline) return "offline";
	if (isNetworkError(error)) return "network";
	return "server";
}

const ERROR_COPY: Record<LoadErrorKind, { title: string; body: string }> = {
	offline: {
		title: "You're offline",
		body: "Connect to the internet to browse. Books already in your library still work.",
	},
	network: {
		title: "Couldn't connect",
		body: "Check your connection and try again.",
	},
	server: {
		title: "Something went wrong",
		body: "This didn't load. Try again in a moment.",
	},
};

type ErrorStateProps = {
	error?: unknown;
	/** Overrides the body copy for server errors. Offline and network copy always wins. */
	message?: string;
	onRetry?: () => void;
	/** Shown under Retry, for pages whose content also lives somewhere else. */
	sourceLink?: { href: string; label: string };
	className?: string;
};

export const ErrorState: React.FC<ErrorStateProps> = ({
	error,
	message,
	onRetry,
	sourceLink,
	className,
}) => {
	const isOnline = useIsOnline();
	const kind = describeLoadError(error, isOnline);
	const copy = ERROR_COPY[kind];
	const Icon = kind === "server" ? AlertCircle : WifiOff;

	return (
		<div
			role="alert"
			data-error-kind={kind}
			className={cn("flex flex-col items-center justify-center gap-3 p-8 text-center", className)}
		>
			<Icon className="size-8 text-muted-foreground" />
			<div>
				<p className="m-0 font-medium text-foreground">{copy.title}</p>
				<p className="m-0 mt-1 text-muted-foreground text-sm">
					{kind === "server" && message ? message : copy.body}
				</p>
			</div>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
			)}
			{sourceLink && (
				<Button asChild variant="ghost" size="sm">
					<a href={sourceLink.href} target="_blank" rel="noopener noreferrer">
						<ExternalLink />
						{sourceLink.label}
					</a>
				</Button>
			)}
		</div>
	);
};

export const EmptyState: React.FC<{ children: React.ReactNode; className?: string }> = ({
	children,
	className,
}) => (
	<div className={cn("flex flex-col items-center justify-center gap-3 p-8 text-center", className)}>
		<Frown className="size-8 text-muted-foreground" />
		<p className="m-0 text-muted-foreground">{children}</p>
	</div>
);
