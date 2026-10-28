import { Progress } from "@lesefluss/ui/progress";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { SettingsSection } from "@/components/settings/settings-section";
import { useCloudStorage } from "@/services/db/hooks/use-cloud-storage";
import { formatBytes } from "@/utils/format-bytes";

const NEARLY_FULL = 0.9;

export function CloudStorageSection() {
	const { data } = useCloudStorage();
	const quota = data?.quota;
	// Unknown until a pull or a refused push from a server that reports it.
	if (!quota) return null;
	const notBackedUp = data.notBackedUp;
	const share = Math.min(1, quota.usedBytes / quota.quotaBytes);
	const usage = `${formatBytes(quota.usedBytes)} of ${formatBytes(quota.quotaBytes)} used`;
	const indicatorClassName =
		notBackedUp.length > 0 ? "bg-destructive" : share >= NEARLY_FULL ? "bg-amber-500" : undefined;

	return (
		<SettingsSection title="Cloud storage">
			<div className="space-y-2 px-4 py-3">
				<div className="flex justify-between text-sm">
					<span className="text-foreground">{usage}</span>
					{/* Floored: an account with room left must never read 100%. */}
					<span className="text-muted-foreground">{Math.floor(share * 100)}%</span>
				</div>
				<Progress
					value={share * 100}
					indicatorClassName={indicatorClassName}
					aria-label="Cloud storage used"
					aria-valuetext={usage}
				/>
			</div>
			{notBackedUp.length > 0 && (
				<div className="border-border border-t py-3">
					<div className="px-4 font-medium text-destructive text-sm">
						Not backed up ({notBackedUp.length})
					</div>
					<p className="mt-1 px-4 text-muted-foreground text-xs">
						These books stay on this device only. To make room, delete books that are already backed
						up; these upload on the next sync once they fit.
					</p>
					<ul className="mt-2">
						{notBackedUp.map((book) => (
							<li key={book.id}>
								<Link
									to="/tabs/library/book/$id"
									params={{ id: book.id }}
									className="flex items-center justify-between gap-2 px-4 py-2 text-foreground text-sm hover:bg-accent"
								>
									<span className="truncate">{book.title}</span>
									<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}
		</SettingsSection>
	);
}
