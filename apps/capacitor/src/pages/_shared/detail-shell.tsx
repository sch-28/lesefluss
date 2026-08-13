/**
 * DetailShell. Shared presentational layout for every detail-style page
 * (catalog book, library book, library series, serial-search preview).
 *
 * Composers supply data + actions; the shell owns layout, theming, scroll, and
 * the page chrome (back button + optional external link + optional
 * destructive header action). Visual rhythm is consistent across all 4 pages.
 */

import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { cn } from "@lesefluss/ui/utils";
import { BookOpen, ExternalLink, Loader2, type LucideIcon } from "lucide-react";
import type React from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import CoverImage from "../../components/cover-image";
import SanitizedDescription from "../../components/sanitized-description";
import { CollapsibleProse } from "./collapsible-prose";

export interface DetailAction {
	label: string;
	icon?: LucideIcon;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	/** Renders the button in danger color. */
	destructive?: boolean;
}

export type HeaderAction = Pick<DetailAction, "label" | "onClick" | "destructive"> & {
	icon: LucideIcon;
};

export interface DetailShellProps {
	// Hero
	cover: string | null | undefined;
	coverFallback?: React.ReactNode;
	eyebrow?: string | null;
	title: string;
	author?: string | null;

	// Stats / subjects
	statsLine?: React.ReactNode;
	/** Hero facts as badges. Preferred over `statsLine`: a badge row fills the
	 *  column beside the cover, where a single line of small grey text left a
	 *  hole on every book that carries no catalog metadata. */
	facts?: readonly React.ReactNode[];
	subjects?: readonly string[];

	// Actions
	primaryAction: DetailAction;
	secondaryActions?: readonly DetailAction[];

	// Body
	description?: { html?: string | null; text?: string | null };
	children?: React.ReactNode;

	// Page chrome
	/** Back-button target. Currently informational only; PageHeader uses router.history.back(). */
	backHref?: string;
	/** External link rendered as an icon button in the toolbar end slot. */
	externalLink?: { href: string; label?: string };
	/** Icon-only header actions, rendered left to right (e.g. edit, delete). */
	headerActions?: readonly HeaderAction[];
	/** Determinate progress bar at the top (0-100). */
	progress?: number;
	/** Centered loading spinner instead of the body. */
	isLoading?: boolean;
	/** Replace body with an error message. */
	errorMessage?: string;
}

export const DetailShell: React.FC<DetailShellProps> = ({
	cover,
	coverFallback,
	eyebrow,
	title,
	author,
	statsLine,
	facts,
	subjects,
	primaryAction,
	secondaryActions,
	description,
	children,
	externalLink,
	headerActions = [],
	progress,
	isLoading,
	errorMessage,
}) => {
	return (
		<>
			<PageHeader
				title={title}
				right={
					<div className="flex items-center gap-1">
						{externalLink && (
							<Button
								asChild
								variant="ghost"
								size="icon"
								aria-label={externalLink.label ?? "View original source"}
							>
								<a href={externalLink.href} target="_blank" rel="noopener noreferrer">
									<ExternalLink />
								</a>
							</Button>
						)}
						{headerActions.map((action) => {
							const ActionIcon = action.icon;
							return (
								<Button
									key={action.label}
									variant="ghost"
									size="icon"
									onClick={action.onClick}
									aria-label={action.label}
									className={
										action.destructive ? "text-destructive hover:text-destructive" : undefined
									}
								>
									<ActionIcon />
								</Button>
							);
						})}
					</div>
				}
			/>

			{progress !== undefined && progress > 0 && (
				<Progress value={progress} className="h-0.5 rounded-none" />
			)}

			{isLoading ? (
				<div className="flex min-h-[60vh] items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : errorMessage ? (
				<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
					<p className="m-0 text-muted-foreground">{errorMessage}</p>
				</div>
			) : (
				<div className="mx-auto max-w-3xl px-4 pt-4 pb-12">
					<section className="flex gap-4">
						<div className="aspect-2/3 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
							<CoverImage
								src={cover}
								alt=""
								priority
								fallback={
									coverFallback ?? (
										<div className="flex h-full items-center justify-center text-muted-foreground">
											<BookOpen className="size-8" />
										</div>
									)
								}
							/>
						</div>
						<div className="flex min-w-0 flex-1 flex-col">
							{eyebrow && (
								<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									{eyebrow}
								</span>
							)}
							<h1 className="mt-1 font-semibold text-xl leading-tight">{title}</h1>
							{author && <p className="mt-1 text-muted-foreground text-sm">{author}</p>}
							{facts && facts.length > 0 && (
								<div className="mt-2.5 flex flex-wrap items-center gap-1.5">
									{facts.map((fact, i) => (
										<span
											// Index key safe: array rebuilt each render, never reordered.
											// biome-ignore lint/suspicious/noArrayIndexKey: see comment above
											key={i}
											className="rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground leading-none"
										>
											{fact}
										</span>
									))}
								</div>
							)}
							{statsLine && (
								<div className="mt-2 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
									{statsLine}
								</div>
							)}
							{/* Pinned to the bottom of the column so the hero is one filled
							    block rather than text floating above dead space. */}
							<div className="mt-auto pt-3">
								<ActionButton action={primaryAction} primary />
							</div>
						</div>
					</section>

					{secondaryActions && secondaryActions.length > 0 && (
						<div className="mt-3 flex flex-col gap-2">
							{secondaryActions.map((a, i) => (
								// Index key safe: array reconstructed each render, never reordered.
								// biome-ignore lint/suspicious/noArrayIndexKey: see comment above
								<ActionButton key={i} action={a} primary={false} />
							))}
						</div>
					)}

					{subjects && subjects.length > 0 && (
						<div className="mt-4 flex flex-wrap gap-1.5">
							{subjects.slice(0, 8).map((s) => (
								<span
									key={s}
									className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-muted-foreground text-xs"
								>
									{s}
								</span>
							))}
						</div>
					)}

					{(description?.html || description?.text) && (
						<section className="mt-6 rounded-lg border border-border bg-card p-4 text-card-foreground">
							<h2 className="m-0 mb-3 font-semibold text-base">About</h2>
							<CollapsibleProse>
								{description.html ? (
									<SanitizedDescription
										className="prose prose-sm max-w-none text-foreground/80 [&_a:hover]:underline [&_a]:text-primary [&_a]:underline-offset-4"
										html={description.html}
									/>
								) : (
									<p className="m-0 text-foreground/80 text-sm leading-relaxed">
										{description.text}
									</p>
								)}
							</CollapsibleProse>
						</section>
					)}

					{children}
				</div>
			)}
		</>
	);
};

const ActionButton: React.FC<{ action: DetailAction; primary: boolean }> = ({
	action,
	primary,
}) => {
	const Icon = action.icon;
	return (
		<Button
			variant={primary ? "default" : "outline"}
			size="lg"
			disabled={action.disabled || action.loading}
			onClick={action.onClick}
			className={cn(
				"w-full",
				action.destructive &&
					(primary
						? "bg-destructive hover:bg-destructive/90"
						: "border-destructive/40 text-destructive hover:bg-destructive/10"),
			)}
		>
			{action.loading ? <Loader2 className="animate-spin" /> : Icon && <Icon />}
			{action.label}
		</Button>
	);
};
