import { Link } from "@tanstack/react-router";

export function NotFound({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-6 py-16 text-center">
			<p className="font-medium text-sm text-muted-foreground">404</p>
			<h1 className="mt-3 font-bold text-2xl tracking-tight">Page not found</h1>
			<p className="mt-3 text-sm text-muted-foreground">
				{children ?? "The page you're looking for doesn't exist."}
			</p>
			<div className="mt-8 flex items-center gap-3">
				<button
					type="button"
					onClick={() => window.history.back()}
					className="rounded-lg border border-border px-4 py-2 font-medium text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
				>
					Go back
				</button>
				<Link
					to="/"
					className="rounded-lg bg-primary px-4 py-2 font-semibold text-sm text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Home
				</Link>
			</div>
		</div>
	);
}
