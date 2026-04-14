import { Link } from "@tanstack/react-router";

export function NotFound({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-6 py-16 text-center">
			<p className="font-medium text-sm text-zinc-500">404</p>
			<h1 className="mt-3 font-bold text-2xl tracking-tight">Page not found</h1>
			<p className="mt-3 text-sm text-zinc-400">
				{children ?? "The page you're looking for doesn't exist."}
			</p>
			<div className="mt-8 flex items-center gap-3">
				<button
					type="button"
					onClick={() => window.history.back()}
					className="rounded-lg border border-zinc-700 px-4 py-2 font-medium text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
				>
					Go back
				</button>
				<Link
					to="/"
					className="rounded-lg bg-zinc-100 px-4 py-2 font-semibold text-sm text-zinc-900 transition-colors hover:bg-white"
				>
					Home
				</Link>
			</div>
		</div>
	);
}
