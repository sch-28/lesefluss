import { initialsFor } from "@lesefluss/core";
import { cn } from "../lib/utils";

const SIZES = {
	sm: "size-8 text-xs",
	md: "size-12 text-base",
	lg: "size-20 text-2xl",
} as const;

export function SocialAvatar({
	name,
	avatarUrl,
	size = "md",
	className,
}: {
	name: string;
	avatarUrl: string | null;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const base = cn(
		"flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary",
		SIZES[size],
		className,
	);
	if (avatarUrl) {
		return (
			<span className={base}>
				<img src={avatarUrl} alt="" draggable={false} className="size-full object-cover" />
			</span>
		);
	}
	return (
		<span className={base} aria-hidden="true">
			{initialsFor(name)}
		</span>
	);
}

/** The part of a profile every legitimate counterpart sees: avatar, name, @handle. */
export function IdentityCard({
	name,
	handle,
	avatarUrl,
}: {
	name: string;
	handle: string | null;
	avatarUrl: string | null;
}) {
	return (
		<div className="flex items-center gap-3">
			<SocialAvatar name={name} avatarUrl={avatarUrl} size="lg" />
			<div className="min-w-0">
				<div className="truncate font-semibold text-base text-foreground">{name || " "}</div>
				<div className="truncate text-muted-foreground text-sm">{handle ? `@${handle}` : "@…"}</div>
			</div>
		</div>
	);
}

/** The identity card framed as a standalone panel, as shown on invite screens. */
export function IdentityCardBox(props: Parameters<typeof IdentityCard>[0]) {
	return (
		<div className="rounded-lg border border-border bg-card p-4 text-left">
			<IdentityCard {...props} />
		</div>
	);
}
