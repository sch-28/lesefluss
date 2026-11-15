import { cn } from "@lesefluss/ui/utils";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
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
				// Wrapping lets a large OS font scale drop the control below its label.
				stacked ? "flex-col items-stretch py-3" : "flex-wrap items-center py-2",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function RowLabel({ title, hint }: { title: string; hint?: React.ReactNode }) {
	return (
		// Takes the row's slack, so the control (ml-auto) sits right, wrapped or not.
		<div className="flex min-w-0 flex-[1_1_6rem] flex-col">
			<span className="text-foreground text-sm">{title}</span>
			{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		</div>
	);
}

type NavRowProps = {
	icon?: React.ComponentType<{ className?: string }>;
	title: string;
	subtitle: string;
	iconClassName?: string;
} & (
	| {
			to: LinkProps["to"];
			params?: LinkProps["params"];
			search?: LinkProps["search"];
			onClick?: never;
	  }
	| {
			to?: never;
			params?: never;
			search?: never;
			onClick: () => void;
			/** Acts in place (plays, opens an editor) instead of going to a page, so no chevron. */
			inPlace?: boolean;
	  }
);

export function NavRow(props: NavRowProps) {
	const { icon: Icon, title, subtitle, iconClassName } = props;
	const inPlace = !props.to && "inPlace" in props && props.inPlace;
	const content = (
		<>
			{Icon && <Icon className={iconClassName ?? "size-5 text-muted-foreground"} />}
			<div className="min-w-0 flex-1">
				<div className="text-foreground text-sm">{title}</div>
				{/* Two lines, not one: a large font scale would leave a single line a few words. */}
				<div className="line-clamp-2 text-muted-foreground text-xs">{subtitle}</div>
			</div>
			{!inPlace && <ChevronRight className="size-4 text-muted-foreground" />}
		</>
	);
	const cls =
		"flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left no-underline transition-colors hover:bg-muted/60";
	if (props.to) {
		return (
			<Link to={props.to} params={props.params} search={props.search} className={cls}>
				{content}
			</Link>
		);
	}
	return (
		<button type="button" onClick={props.onClick} className={cls}>
			{content}
		</button>
	);
}

export function ExpanderRow({
	title,
	open,
	onToggle,
}: {
	title: string;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
			onClick={onToggle}
			aria-expanded={open}
		>
			<span className="text-foreground text-sm">{title}</span>
			<ChevronDown
				className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
			/>
		</button>
	);
}
