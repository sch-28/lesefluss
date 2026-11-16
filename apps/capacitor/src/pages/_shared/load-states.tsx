import { Button } from "@lesefluss/ui/button";
import { AlertCircle, ExternalLink, WifiOff } from "lucide-react";
import type React from "react";
import { EmptyState } from "../../components/empty-state";
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
	/** The page's main content failed: centre it like a page-level empty state. */
	page?: boolean;
	className?: string;
};

export const ErrorState: React.FC<ErrorStateProps> = ({
	error,
	message,
	onRetry,
	sourceLink,
	page,
	className,
}) => {
	const isOnline = useIsOnline();
	const kind = describeLoadError(error, isOnline);
	const copy = ERROR_COPY[kind];

	return (
		<EmptyState
			role="alert"
			data-error-kind={kind}
			icon={kind === "server" ? AlertCircle : WifiOff}
			title={copy.title}
			page={page}
			className={className}
			action={
				(onRetry || sourceLink) && (
					<>
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
					</>
				)
			}
		>
			{kind === "server" && message ? message : copy.body}
		</EmptyState>
	);
};

export { EmptyState };
