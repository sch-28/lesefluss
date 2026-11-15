import { IconButton } from "@lesefluss/ui/icon-button";
import { cn } from "@lesefluss/ui/utils";
import { type AnyRouter, type NavigateOptions, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ComponentType, ReactNode, Ref } from "react";
import { resolveBack } from "./resolve-back";

export function PageHeader({
	title,
	icon: Icon,
	right,
	backTo,
	titleShown,
	ref,
}: {
	title: string;
	/**
	 * Set when the page carries its own title heading: the header then echoes the title
	 * only while this is true, and keeps the echo out of the a11y tree.
	 */
	titleShown?: boolean;
	ref?: Ref<HTMLElement>;
	icon?: ComponentType<{ className?: string }>;
	right?: ReactNode;
	/** Where Back goes when there is no history, e.g. after opening a link from outside the app. */
	backTo?: NavigateOptions["to"];
}) {
	const router = useRouter();
	return (
		<header
			ref={ref}
			className="sticky top-0 z-20 flex flex-col border-border border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur"
		>
			<div className="flex h-12 items-center gap-2 px-2">
				<IconButton
					onClick={() => goBack(router, backTo)}
					aria-label="Back"
					className="-my-1 text-muted-foreground hover:text-foreground"
				>
					<ChevronLeft />
				</IconButton>
				{Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
				{titleShown === undefined ? (
					<h1 className={TITLE}>{title}</h1>
				) : (
					<p
						aria-hidden="true"
						className={cn(TITLE, "transition-opacity", titleShown ? "opacity-100" : "opacity-0")}
					>
						{title}
					</p>
				)}
				{right}
			</div>
		</header>
	);
}

const TITLE = "m-0 min-w-0 flex-1 truncate font-semibold text-base leading-5";

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
