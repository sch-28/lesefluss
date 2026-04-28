/**
 * DetailShell — presentational layout for every detail-style page.
 *
 * Composers (catalog book, library book, library series, serial-search
 * preview) supply their own data + actions; the shell owns layout, theming,
 * scroll, and the `IonPage`/`IonHeader`/`IonContent` chrome. The visual
 * rhythm is the same `.book-detail-*` skeleton both existing detail pages
 * already used; this file just formalizes the seam so the rules apply
 * identically across kinds.
 *
 * The CSS class names live in `theme/monochrome.css` (the global theme file)
 * so they participate in light/dark/sepia inheritance the same way every
 * other page does — no per-component stylesheets to keep in sync.
 */

import {
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonPage,
	IonProgressBar,
	IonSpinner,
	IonText,
	IonToolbar,
} from "@ionic/react";
import { bookOutline, openOutline } from "ionicons/icons";
import type React from "react";
import CoverImage from "../../components/cover-image";
import SanitizedDescription from "../../components/sanitized-description";

export interface DetailAction {
	label: string;
	icon?: string;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	/** Renders the button in danger color. */
	destructive?: boolean;
}

export interface DetailShellProps {
	// ── Hero ─────────────────────────────────────────────────────────
	/** `null` and `undefined` both render the fallback — composers can pass either. */
	cover: string | null | undefined;
	/** Custom fallback rendered when `cover` is null/fails. Defaults to a book outline icon. */
	coverFallback?: React.ReactNode;
	/** Small uppercase label above the title (e.g. "Standard Ebooks", "AO3"). */
	eyebrow?: string | null;
	title: string;
	author?: string | null;

	// ── Stats / subjects ─────────────────────────────────────────────
	/** Inline status line under the title (e.g. "12% read · 5 highlights · On device"). */
	statsLine?: React.ReactNode;
	/** Pill-style genre/topic tags rendered between hero and actions. */
	subjects?: readonly string[];

	// ── Actions ──────────────────────────────────────────────────────
	primaryAction: DetailAction;
	secondaryActions?: readonly DetailAction[];

	// ── Body ─────────────────────────────────────────────────────────
	/** Description rendered in a card beneath actions. `html` takes precedence over `text`. */
	description?: { html?: string | null; text?: string | null };
	/** Catch-all for kind-specific extras (chapter lists, related items). */
	children?: React.ReactNode;

	// ── Page chrome ──────────────────────────────────────────────────
	/** Back-button target. Defaults to `/tabs/library`. */
	backHref?: string;
	/** External link rendered as an icon button in the toolbar (e.g. source page). */
	externalLink?: { href: string; label?: string };
	/**
	 * Icon-only action rendered in the toolbar end slot (e.g. delete).
	 * Same shape as `DetailAction` minus disabled/loading (toolbar buttons
	 * stay simple) and with `icon` required since the button is icon-only.
	 */
	headerAction?: Pick<DetailAction, "label" | "onClick" | "destructive"> & {
		icon: string;
	};
	/** Determinate progress bar at the top (e.g. import progress 0-100). */
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
	subjects,
	primaryAction,
	secondaryActions,
	description,
	children,
	backHref = "/tabs/library",
	externalLink,
	headerAction,
	progress,
	isLoading,
	errorMessage,
}) => {
	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref={backHref} />
					</IonButtons>
					{(externalLink || headerAction) && (
						<IonButtons slot="end">
							{externalLink && (
								<IonButton
									href={externalLink.href}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={externalLink.label ?? "View original source"}
									title={externalLink.label ?? "View original source"}
								>
									<IonIcon slot="icon-only" icon={openOutline} />
								</IonButton>
							)}
							{headerAction && (
								<IonButton
									onClick={headerAction.onClick}
									color={headerAction.destructive ? "danger" : undefined}
									aria-label={headerAction.label}
									title={headerAction.label}
								>
									<IonIcon slot="icon-only" icon={headerAction.icon} />
								</IonButton>
							)}
						</IonButtons>
					)}
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{progress !== undefined && progress > 0 && (
					<IonProgressBar value={progress / 100} type="determinate" />
				)}

				{isLoading ? (
					<div className="flex h-full items-center justify-center">
						<IonSpinner />
					</div>
				) : errorMessage ? (
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<IonText color="medium">
							<p style={{ margin: 0 }}>{errorMessage}</p>
						</IonText>
					</div>
				) : (
					<div className="book-detail-page">
						<div className="book-detail-hero">
							<div className="book-detail-cover">
								<CoverImage
									src={cover}
									alt=""
									priority
									fallback={
										coverFallback ?? (
											<div className="book-detail-cover-placeholder">
												<IonIcon icon={bookOutline} />
											</div>
										)
									}
								/>
							</div>
							<div className="book-detail-meta">
								{eyebrow && <span className="book-detail-eyebrow">{eyebrow}</span>}
								<h1 className="book-detail-title">{title}</h1>
								{author && <p className="book-detail-author">{author}</p>}
								{statsLine && <div className="book-detail-stats">{statsLine}</div>}
							</div>
						</div>

						<div className="book-detail-actions">
							<ActionButton action={primaryAction} primary />
							{secondaryActions?.map((a, i) => (
								// Index key is safe: the array is constructed once per render
								// from a static composition in each page; never reordered or
								// sliced. Using `a.label` would collide if two actions shared
								// the same label.
								// biome-ignore lint/suspicious/noArrayIndexKey: see comment above
								<ActionButton key={i} action={a} primary={false} />
							))}
						</div>

						{subjects && subjects.length > 0 && (
							<div className="book-detail-subjects">
								{subjects.slice(0, 8).map((s) => (
									<span key={s} className="book-detail-subject">
										{s}
									</span>
								))}
							</div>
						)}

						{(description?.html || description?.text) && (
							<section className="book-detail-card">
								<h2 className="book-detail-section-title">About</h2>
								{description.html ? (
									<SanitizedDescription
										className="book-detail-description"
										html={description.html}
									/>
								) : (
									<p className="book-detail-summary">{description.text}</p>
								)}
							</section>
						)}

						{children}
					</div>
				)}
			</IonContent>
		</IonPage>
	);
};

const ActionButton: React.FC<{ action: DetailAction; primary: boolean }> = ({
	action,
	primary,
}) => (
	<IonButton
		expand="block"
		fill={primary ? "solid" : "outline"}
		color={action.destructive ? "danger" : undefined}
		disabled={action.disabled || action.loading}
		onClick={action.onClick}
	>
		{action.loading ? (
			<IonSpinner name="crescent" />
		) : (
			<>
				{action.icon && <IonIcon slot="start" icon={action.icon} />}
				{action.label}
			</>
		)}
	</IonButton>
);
