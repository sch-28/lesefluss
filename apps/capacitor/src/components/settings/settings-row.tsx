import { cn } from "@lesefluss/ui/utils";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type React from "react";

export function SettingsRow({
	stacked = false,
	className,
	children,
}: {
	/** Full-width control under the label (chips, cards, sliders). */
	stacked?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex min-h-12 gap-3 px-4",
				stacked ? "flex-col items-stretch py-3" : "items-center justify-between py-2",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function RowLabel({ title, hint }: { title: string; hint?: React.ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col">
			<span className="text-foreground text-sm">{title}</span>
			{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		</div>
	);
}

type NavRowProps = {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	subtitle: string;
	iconClassName?: string;
} & ({ to: LinkProps["to"]; onClick?: never } | { to?: never; onClick: () => void });

export function NavRow({ icon: Icon, title, subtitle, iconClassName, to, onClick }: NavRowProps) {
	const content = (
		<>
			<Icon className={iconClassName ?? "size-5 text-muted-foreground"} />
			<div className="min-w-0 flex-1">
				<div className="text-foreground text-sm">{title}</div>
				<div className="truncate text-muted-foreground text-xs">{subtitle}</div>
			</div>
			<ChevronRight className="size-4 text-muted-foreground" />
		</>
	);
	const cls =
		"flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left no-underline transition-colors hover:bg-muted/60";
	if (to) {
		return (
			<Link to={to} className={cls}>
				{content}
			</Link>
		);
	}
	return (
		<button type="button" onClick={onClick} className={cls}>
			{content}
		</button>
	);
}
