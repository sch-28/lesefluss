/**
 * DetailShell. Shared presentational layout for every detail-style page
 * (catalog book, library book, library series, serial-search preview).
 *
 * Composers supply data + actions; the shell owns layout, theming, scroll, and
 * the page chrome (back button + optional external link + optional
 * destructive header action). Visual rhythm is consistent across all 4 pages.
 */

import { Button } from "@lesefluss/ui/button";
import { CHIP_BASE, FilterChip } from "@lesefluss/ui/filter-chip";
import { Progress } from "@lesefluss/ui/progress";
import { cn } from "@lesefluss/ui/utils";
import { BookOpen, ExternalLink, Loader2, type LucideIcon, SearchX } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "../../components/app-shell/page-header";
import CoverImage from "../../components/cover-image";
import SanitizedDescription from "../../components/sanitized-description";
import { CollapsibleProse } from "./collapsible-prose";
import { EmptyState, ErrorState } from "./load-states";
import { readableSubjects } from "./readable-subjects";

export interface DetailAction {
	label: string;
	/** Trails the label only on a wide button (28rem and up); a long one ends in an ellipsis. */
	detail?: string;
	icon?: LucideIcon;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	/** Renders the button in danger color. */
	destructive?: boolean;
}

export type HeaderAction = Pick<DetailAction, "label" | "onClick" | "destructive" | "disabled"> & {
	icon: LucideIcon;
};

export interface DetailShellProps {
	// Hero
	cover: string | null | undefined;
	coverFallback?: React.ReactNode;
	eyebrow?: string | null;
	title: string;
	author?: string | null;
	/** Makes the author a link, e.g. to more books by them. */
	onAuthorTap?: () => void;

	// Stats / subjects
	statsLine?: React.ReactNode;
	/** Hero facts as plain text; a fact that is a link styles itself as one. */
	facts?: readonly React.ReactNode[];
	subjects?: readonly string[];
	/** Tappable tags; shown instead of `subjects` when given. */
	tagLinks?: {
		tags: readonly { id: string; label: string }[];
		onTap: (tagId: string) => void;
	};

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
	/** Hero frame with a cover placeholder and a spinner instead of the body. */
	isLoading?: boolean;
	/** Replace body with an error message. */
	errorMessage?: string;
	/** Replace body with a load-failure state (offline-aware). Wins over `errorMessage`. */
	error?: unknown;
	onRetry?: () => void;
	errorSourceLink?: { href: string; label: string };
}

const COLLAPSED_TAG_COUNT = 8;
/** The app's chip at hero size; a coarse pointer still gets the 44px hit area. */
const SMALL_CHIP = "h-8 px-3 text-xs";

export const DetailShell: React.FC<DetailShellProps> = ({
	cover,
	coverFallback,
	eyebrow,
	title,
	author,
	onAuthorTap,
	statsLine,
	facts,
	subjects,
	tagLinks,
	primaryAction,
	secondaryActions,
	description,
	children,
	externalLink,
	headerActions = [],
	progress,
	isLoading,
	errorMessage,
	error,
	onRetry,
	errorSourceLink,
}) => {
	const hasHero = !isLoading && error === undefined && !errorMessage;
	return (
		<>
			<PageHeader
				title={hasHero ? undefined : title}
				width="text"
				right={
					<div className="flex items-center gap-1">
						{externalLink && (
							<Button
								asChild
								variant="ghost"
								size="icon"
								aria-label={externalLink.label ?? "View original source"}
								title={externalLink.label ?? "View original source"}
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
									disabled={action.disabled}
									aria-label={action.label}
									title={action.label}
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
				<DetailFrame>
					<section className="flex gap-4" aria-busy="true">
						<div className="aspect-2/3 w-28 shrink-0 rounded-md border border-border bg-muted" />
						<div className="flex flex-1 items-center justify-center">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					</section>
				</DetailFrame>
			) : error !== undefined ? (
				<ErrorState
					page
					error={error}
					message={errorMessage}
					onRetry={onRetry}
					sourceLink={errorSourceLink}
				/>
			) : errorMessage ? (
				<EmptyState
					icon={SearchX}
					page
					action={
						<Button
							variant="outline"
							onClick={primaryAction.onClick}
							disabled={primaryAction.disabled}
						>
							{primaryAction.label}
						</Button>
					}
				>
					{errorMessage}
				</EmptyState>
			) : (
				<DetailFrame>
					{/* Wraps: at a large font scale the text drops below the cover rather than squeeze. */}
					<section className="flex flex-wrap gap-4">
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
						<div className="flex min-w-0 flex-[1_1_10rem] flex-col">
							{eyebrow && (
								<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									{eyebrow}
								</span>
							)}
							<h1 className="m-0 mt-1 break-words font-semibold text-xl leading-tight">{title}</h1>
							{author &&
								(onAuthorTap ? (
									<button
										type="button"
										onClick={onAuthorTap}
										className="mt-1 self-start border-0 bg-transparent p-0 text-left text-primary text-sm underline underline-offset-4"
									>
										{author}
									</button>
								) : (
									<p className="mt-1 text-muted-foreground text-sm">{author}</p>
								))}
							{facts && facts.length > 0 && (
								// Every fact leads with its dot; the frame clips the dot that starts each
								// line, so a wrap never leaves one dangling.
								<div className="mt-2 overflow-hidden text-muted-foreground text-xs">
									<div className="-ml-4 flex flex-wrap items-center gap-y-1">
										{facts.map((fact, i) => (
											<span
												// Index key safe: array rebuilt each render, never reordered.
												// biome-ignore lint/suspicious/noArrayIndexKey: see comment above
												key={i}
												className="inline-flex items-center before:w-4 before:shrink-0 before:text-center before:content-['·']"
											>
												{fact}
											</span>
										))}
									</div>
								</div>
							)}
							{statsLine && (
								<div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
									{statsLine}
								</div>
							)}
							{/* Pinned to the bottom of the column so the hero is one filled
							    block rather than text floating above dead space. */}
							<div className="mt-auto flex flex-wrap gap-2 pt-3" data-testid="detail-actions">
								<ActionButton action={primaryAction} primary />
								{secondaryActions?.map((a, i) => (
									// Index key safe: array reconstructed each render, never reordered.
									// biome-ignore lint/suspicious/noArrayIndexKey: see comment above
									<ActionButton key={i} action={a} primary={false} />
								))}
							</div>
						</div>
					</section>

					{tagLinks && tagLinks.tags.length > 0 ? (
						<TagList tags={tagLinks.tags} onTagTap={tagLinks.onTap} />
					) : (
						subjects &&
						subjects.length > 0 && (
							<TagList tags={readableSubjects(subjects).map((label) => ({ id: label, label }))} />
						)
					)}

					{(description?.html || description?.text) && (
						<section className="book-detail-card mt-6">
							<h2 className="book-detail-section-title">About</h2>
							<CollapsibleProse>
								{description.html ? (
									<SanitizedDescription
										className="text-foreground/80 text-sm leading-relaxed [&_a:hover]:underline [&_a]:text-primary [&_a]:underline-offset-4 [&_p+p]:mt-3"
										html={description.html}
									/>
								) : (
									<div className="flex flex-col gap-3 text-foreground/80 text-sm leading-relaxed">
										{(description.text ?? "").split(/\n\s*\n/).map((paragraph, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one fixed text
											<p key={i} className="m-0">
												{paragraph}
											</p>
										))}
									</div>
								)}
							</CollapsibleProse>
						</section>
					)}

					{children}
				</DetailFrame>
			)}
		</>
	);
};

const DetailFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<PageContainer width="text" className="px-4 pt-4 pb-12">
		{children}
	</PageContainer>
);

/** Without `onTagTap` the tags are plain labels in the same chip shape. */
const TagList: React.FC<{
	tags: readonly { id: string; label: string }[];
	onTagTap?: (tagId: string) => void;
}> = ({ tags, onTagTap }) => {
	const [isExpanded, setExpanded] = useState(false);
	const visible = isExpanded ? tags : tags.slice(0, COLLAPSED_TAG_COUNT);
	const hiddenCount = tags.length - visible.length;
	return (
		<div className="mt-4 flex flex-wrap gap-2" data-testid="detail-tags">
			{visible.map((t) =>
				onTagTap ? (
					<FilterChip
						key={t.id}
						selected={false}
						action
						onClick={() => onTagTap(t.id)}
						className={SMALL_CHIP}
					>
						{t.label}
					</FilterChip>
				) : (
					<span key={t.id} className={cn(CHIP_BASE, SMALL_CHIP, "hover:bg-muted")}>
						{t.label}
					</span>
				),
			)}
			{hiddenCount > 0 && (
				<FilterChip
					selected={false}
					action
					onClick={() => setExpanded(true)}
					className={cn(SMALL_CHIP, "text-muted-foreground")}
				>
					{hiddenCount} more
				</FilterChip>
			)}
		</div>
	);
};

const ActionButton: React.FC<{ action: DetailAction; primary: boolean }> = ({
	action,
	primary,
}) => {
	const Icon = action.icon;
	return (
		<Button
			variant={action.destructive ? "destructive" : primary ? "default" : "outline"}
			disabled={action.disabled || action.loading}
			onClick={action.onClick}
			// The primary fills the phone column, where its container query hides the detail when
			// narrow; desktop drops the container, as inline-size containment would collapse a
			// label-width button. Secondary actions are label-width everywhere.
			className={
				primary
					? "@container w-full md:w-auto md:max-w-full md:[container-type:normal]"
					: "max-w-full"
			}
		>
			{action.loading ? <Loader2 className="animate-spin" /> : Icon && <Icon />}
			<span className="min-w-0 truncate">
				{action.label}
				{action.detail && <span className="@md:inline hidden md:inline"> · {action.detail}</span>}
			</span>
		</Button>
	);
};
