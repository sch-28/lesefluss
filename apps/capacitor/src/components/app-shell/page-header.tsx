import { IconButton } from "@lesefluss/ui/icon-button";
import { type AnyRouter, type NavigateOptions, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ComponentType, ReactNode, Ref } from "react";
import { PageContainer, type PageWidth } from "../page-container";
import { resolveBack } from "./resolve-back";

/** The sticky bar every drill-in page shares: Back, the page's title and its actions.
 *  Without a title the page's own heading names it (a book page's hero). */
export function PageHeader({
	title,
	width,
	icon: Icon,
	right,
	backTo,
	onBack,
	ref,
}: {
	title?: string;
	/** The page's content width, so back, title and actions line up with the content column. */
	width: PageWidth;
	ref?: Ref<HTMLElement>;
	icon?: ComponentType<{ className?: string }>;
	right?: ReactNode;
	/** Where Back goes when there is no history, e.g. after opening a link from outside the app. */
	backTo?: NavigateOptions["to"];
	/** Replaces history-back, for a page whose Back has its own target or asks first. */
	onBack?: () => void;
}) {
	const router = useRouter();
	return (
		<header ref={ref} className={HEADER_SHELL}>
			<PageContainer width={width} className="flex h-12 items-center gap-2 px-4">
				<IconButton
					onClick={onBack ?? (() => goBack(router, backTo))}
					aria-label="Back"
					className="-my-1 -ml-3 text-muted-foreground hover:text-foreground"
				>
					<ChevronLeft />
				</IconButton>
				{Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
				{title ? <h1 className={HEADER_TITLE}>{title}</h1> : <div className="flex-1" />}
				{right}
			</PageContainer>
		</header>
	);
}

export const HEADER_SHELL =
	"sticky top-0 z-20 flex flex-col border-border border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur";
export const HEADER_TITLE = "m-0 min-w-0 flex-1 truncate font-semibold text-base leading-5";

/**
 * Without history (a deep link, a reload) Back goes where Android back goes. Through
 * router.navigate, which keeps the web build's /app basepath (LESE-20).
 */
function goBack(router: AnyRouter, backTo: NavigateOptions["to"] | undefined) {
	if (router.history.canGoBack()) {
		router.history.back();
		return;
	}
	if (backTo) {
		void router.navigate({ to: backTo, replace: true });
		return;
	}
	const { pathname, searchStr } = router.state.location;
	const action = resolveBack(pathname, searchStr, false);
	if (action.kind === "replace") void router.navigate({ href: action.to, replace: true });
}
