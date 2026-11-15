import { Button } from "@lesefluss/ui/button";
import { type NavigateOptions, useRouter } from "@tanstack/react-router";
import { PageHeader } from "./page-header";

/** A page whose subject is gone: says so and offers the one way on. */
export function NotFound({
	title,
	message,
	backLabel,
	backTo,
}: {
	title: string;
	message: string;
	backLabel: string;
	backTo: NavigateOptions["to"];
}) {
	const router = useRouter();
	return (
		<div className="flex min-h-screen flex-col bg-background">
			<PageHeader title={title} backTo={backTo} />
			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
				<p className="m-0 text-muted-foreground text-sm">{message}</p>
				<Button
					variant="secondary"
					onClick={() => void router.navigate({ to: backTo, replace: true })}
				>
					{backLabel}
				</Button>
			</div>
		</div>
	);
}
