import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useSyncContext } from "../../contexts/sync-context";
import { type CatalogSearchResult, getSimilarBooks } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { useFeed } from "../../services/social/feed";
import { editionKey } from "./editions";
import type { ExploreSearch } from "./explore-search";
import { excludeOwned, friendsReading, pickAuthors, pickSeedBook } from "./personal-picks";
import Shelf from "./shelf";
import { SHELF_STALE_TIME_MS, useAuthorBooks } from "./use-author-books";

const AUTHOR_BOOKS = 8;

type Props = {
	onOpen: (result: CatalogSearchResult) => void;
	onBrowse: (search: ExploreSearch) => void;
};

/**
 * Shelves built from the reader's own library (works without an account) and,
 * when signed in, from friends' activity. Each holds its slot with a skeleton
 * while it loads and hides only once it loaded with nothing to show.
 */
const PersonalShelves: React.FC<Props> = ({ onOpen, onBrowse }) => {
	const { data: library } = queryHooks.useBooks();
	const { data: owned } = queryHooks.useLibraryCatalogIds();
	const { isLoggedIn } = useSyncContext();
	const ownedIds = new Set(owned?.keys() ?? []);

	const books = library?.books ?? [];
	const ownedEditions = new Set(books.map((b) => editionKey(b.title, b.author)));
	const seed = pickSeedBook(books);
	const authors = pickAuthors(books);

	const similar = useQuery({
		queryKey: catalogKeys.similar(seed?.catalogId ?? ""),
		queryFn: ({ signal }) => getSimilarBooks(seed?.catalogId ?? "", signal),
		enabled: !!seed,
		staleTime: SHELF_STALE_TIME_MS,
	});
	const author1 = useAuthorBooks(authors[0], AUTHOR_BOOKS);
	const author2 = useAuthorBooks(authors[1], AUTHOR_BOOKS);
	const author3 = useAuthorBooks(authors[2], AUTHOR_BOOKS);
	const byAuthors = [author1, author2, author3];
	const feed = useFeed(isLoggedIn);

	const becauseYouRead = excludeOwned(similar.data?.results ?? [], ownedIds, ownedEditions);
	const authorBooks = excludeOwned(
		byAuthors.flatMap((q) => q.data?.results ?? []),
		ownedIds,
		ownedEditions,
	);
	const friends = isLoggedIn
		? friendsReading(feed.data?.pages.flatMap((p) => p.items) ?? [], ownedIds, ownedEditions)
		: [];

	// isLoading, not isPending: a disabled query (no second author) stays pending forever.
	const isSimilarLoading = similar.isLoading;
	const isAuthorsLoading = byAuthors.some((q) => q.isLoading);
	const isFeedLoading = isLoggedIn && !!feed.isLoading;

	return (
		<>
			{seed && (isSimilarLoading || becauseYouRead.length > 0) && (
				<Shelf
					title={`Because you read ${seed.title}`}
					books={becauseYouRead}
					onOpen={onOpen}
					isLoading={isSimilarLoading}
				/>
			)}
			{(isAuthorsLoading || authorBooks.length > 0) && (
				<Shelf
					title="More by authors you read"
					books={authorBooks}
					onOpen={onOpen}
					onSeeAll={authors[0] ? () => onBrowse({ author: authors[0], lang: "all" }) : undefined}
					isLoading={isAuthorsLoading}
				/>
			)}
			{(isFeedLoading || friends.length > 0) && (
				<Shelf
					title="Friends are reading"
					books={friends}
					onOpen={onOpen}
					isLoading={isFeedLoading}
				/>
			)}
		</>
	);
};

export default PersonalShelves;
