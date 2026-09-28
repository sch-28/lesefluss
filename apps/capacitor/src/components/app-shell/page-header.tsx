import { type NavigateOptions, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export function PageHeader({
	title,
	icon: Icon,
	right,
	backTo,
}: {
	title: string;
	icon?: ComponentType<{ className?: string }>;
	right?: ReactNode;
	/** Where Back goes when there is no history, e.g. after opening a link from outside the app. */
	backTo?: NavigateOptions["to"];
}) {
	const router = useRouter();
	return (
		<header className="sticky top-0 z-20 flex flex-col border-border border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur">
			<div className="flex h-12 items-center gap-2 px-2">
				<button
					type="button"
					onClick={() =>
						backTo && !router.history.canGoBack()
							? void router.navigate({ to: backTo, replace: true })
							: router.history.back()
					}
					aria-label="Back"
					className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<ChevronLeft className="size-5" />
				</button>
				{Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
				<h1 className="m-0 flex-1 font-semibold text-base leading-5">{title}</h1>
				{right}
			</div>
		</header>
	);
}
