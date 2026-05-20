import { Button } from "@lesefluss/ui/button";
import { AlertCircle, Lock } from "lucide-react";
import type React from "react";
import { CloudflareChallenge } from "../../components/cloudflare-challenge";
import type { ProviderId } from "../../services/serial-scrapers";

type Props =
	| { status: "locked" }
	| { status: "error"; reason: string; provider?: ProviderId; onRetry: () => void };

/**
 * Centered message for the two terminal chapter states a reader can land on.
 * The `loading` state has its own component (`ReaderSkeleton`) shared with
 * normal book loads. Kept presentational: no DB, no mutations, no hooks. The
 * reader composes `useChapterFetch` and renders this when `kind === 'locked'`
 * or `'error'`.
 */
export const ChapterStateOverlay: React.FC<Props> = (props) => {
	if (props.status === "locked") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
				<Lock className="size-10 opacity-60" aria-hidden />
				<p className="text-base">This chapter is behind a paywall.</p>
				<p className="text-sm opacity-60">Open the original page in your browser to read it.</p>
			</div>
		);
	}

	if (props.reason === "CLOUDFLARE_CHALLENGE" && props.provider) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
				<AlertCircle className="size-10 opacity-60" aria-hidden />
				<p className="text-base">Cloudflare blocked this chapter.</p>
				<div className="w-full max-w-sm">
					<CloudflareChallenge provider={props.provider} onResolved={props.onRetry} />
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
			<AlertCircle className="size-10 opacity-60" aria-hidden />
			<p className="text-base">Couldn't load this chapter.</p>
			<p className="text-sm opacity-60">{props.reason}</p>
			<Button variant="outline" onClick={props.onRetry}>
				Retry
			</Button>
		</div>
	);
};
