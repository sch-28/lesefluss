import { Button } from "@lesefluss/ui/button";
import { type NavigateOptions, useRouter } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { EmptyState } from "../empty-state";
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
			<PageHeader width="text" title={title} backTo={backTo} />
			<EmptyState
				icon={SearchX}
				className="flex-1"
				action={
					<Button
						variant="outline"
						onClick={() => void router.navigate({ to: backTo, replace: true })}
					>
						{backLabel}
					</Button>
				}
			>
				{message}
			</EmptyState>
		</div>
	);
}
