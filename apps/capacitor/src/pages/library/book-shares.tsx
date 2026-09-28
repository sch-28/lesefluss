import { Button } from "@lesefluss/ui/button";
import { toast } from "@/components/toast";
import { shareFailureMessage, useRevokeShare, useSharesForBook } from "@/services/social/shares";

/** Open shares of this book, for its owner: who has not answered yet, with a way to take the offer back. */
export function BookShares({ bookId, enabled }: { bookId: string; enabled: boolean }) {
	const shares = useSharesForBook(bookId, enabled);
	const revoke = useRevokeShare(bookId);
	if (!enabled || !shares.data?.length) return null;
	return (
		<section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
			<h2 className="m-0 mb-2 font-semibold text-base">Shared with</h2>
			<ul className="m-0 flex list-none flex-col gap-2 p-0">
				{shares.data.map((share) => (
					<li key={share.shareId} className="flex items-center justify-between gap-3 text-sm">
						<span className="min-w-0 truncate">
							<span className="font-medium">@{share.recipient.handle}</span>
							<span className="text-muted-foreground">
								{share.state === "expired" ? " · Not accepted" : " · Waiting"}
							</span>
						</span>
						<Button
							size="sm"
							variant="ghost"
							disabled={revoke.isPending}
							onClick={() =>
								revoke.mutate(share.shareId, {
									onError: (err) => toast.error(shareFailureMessage(err)),
								})
							}
						>
							Revoke
						</Button>
					</li>
				))}
			</ul>
		</section>
	);
}
