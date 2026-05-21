import { createFileRoute } from "@tanstack/react-router";
import BookReader from "@/pages/reader";
import { bookKeys } from "@/services/db/hooks/query-keys";
import { queries } from "@/services/db/queries";
import { queryClient } from "@/services/query-client";

export const Route = createFileRoute("/tabs/reader/$id")({
	// Warm book + content + word-index queries before BookReader mounts so the
	// component renders against a populated React Query cache. Router preloads
	// on hover/touchstart (defaultPreload: "intent"), so the prefetches run
	// ahead of route activation.
	loader: ({ params }) => {
		const { id } = params;
		void queryClient.prefetchQuery({
			queryKey: bookKeys.detail(id),
			queryFn: () => queries.getBook(id),
		});
		void queryClient.prefetchQuery({
			queryKey: bookKeys.content(id),
			queryFn: () => queries.getBookContent(id),
		});
		void queryClient.prefetchQuery({
			queryKey: bookKeys.wordIndex(id),
			queryFn: () => queries.loadBookWordIndex(id),
		});
	},
	component: ReaderRoute,
});

function ReaderRoute() {
	const { id } = Route.useParams();
	return <BookReader id={id} />;
}
