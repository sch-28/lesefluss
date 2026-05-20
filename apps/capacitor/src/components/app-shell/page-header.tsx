import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export function PageHeader({
	title,
	icon: Icon,
	right,
}: {
	title: string;
	icon?: ComponentType<{ className?: string }>;
	right?: ReactNode;
}) {
	const router = useRouter();
	return (
		<header className="sticky top-0 z-20 flex flex-col border-border border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
			<div className="flex h-12 items-center gap-2 px-2">
				<a
					href="#"
					role="button"
					onClick={(e) => {
						e.preventDefault();
						router.history.back();
					}}
					aria-label="Back"
					className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
				>
					<ChevronLeft className="size-5" />
				</a>
				{Icon && <Icon className="size-5 shrink-0  text-muted-foreground" />}
				<h1 className="m-0 flex-1 font-semibold text-base leading-5">{title}</h1>
				{right}
			</div>
		</header>
	);
}
