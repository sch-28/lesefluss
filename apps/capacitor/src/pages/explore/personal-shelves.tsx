import { Button } from "@lesefluss/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { useSyncContext } from "../../contexts/sync-context";
import { type CatalogSearchResult, getSimilarBooks } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { isFirstLoad } from "../../services/query-client";
import { useFeed } from "../../services/social/feed";
import { editionKey } from "./editions";
import type { ExploreSearch } from "./explore-search";
import { excludeOwned, friendsReading, pickAuthors, pickSeedBook } from "./personal-picks";
import Shelf from "./shelf";
import { SHELF_STALE_TIME_MS, useAuthorBooks } from "./use-author-books";

const AUTHOR_BOOKS = 8;
const FRIENDS_EMPTY_KEY = "explore-friends-reading-empty";

/** Whether the friends shelf was empty last time, so a cold start reserves the line, not a strip. */
function readFriendsWasEmpty(): boolean {
	try {
		return localStorage.getItem(FRIENDS_EMPTY_KEY) === "1";
	} catch {
		return false;
	}
}

function storeFriendsWasEmpty(isEmpty: boolean): void {
	try {
		localStorage.setItem(FRIENDS_EMPTY_KEY, isEmpty ? "1" : "0");
	} catch {
		// Only a loading hint; without it the strip's skeleton holds the slot.
	}
}

type Props = {
	onOpen: (result: CatalogSearchResult) => void;
	onBrowse: (search: ExploreSearch) => void;
};

/**
 * True until the library and wishlist are first read. A failed read ends it too:
 * the landing then shows its shelves without the personal ones, never a blank area.
 */
export function usePersonalShelvesPending(): boolean {
	const books = queryHooks.useBooks();
	const wishlist = queryHooks.useWishlist();
	return isFirstLoad(books) || isFirstLoad(wishlist);
}

/**
 * Shelves built from the reader's own library (works without an account) and,
 * when signed in, from friends' activity.
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
	// A failed shelf shows its error, never the empty note: that note claims the catalog has nothing.
	const similarError = becauseYouRead.length === 0 ? similar.error : null;
	const authorsError =
		authorBooks.length === 0 ? (byAuthors.find((q) => q.error)?.error ?? null) : null;
	const feedError = friends.length === 0 && isLoggedIn ? (feed.error ?? null) : null;
	const hasFeedLoaded = isLoggedIn && !!feed.data && !isFeedLoading;
	const isFriendsEmpty = hasFeedLoaded && !feedError && friends.length === 0;
	useEffect(() => {
		if (hasFeedLoaded) storeFriendsWasEmpty(friends.length === 0);
	}, [hasFeedLoaded, friends.length]);
	const showFriendsLine = isFriendsEmpty || (isFeedLoading && readFriendsWasEmpty());

	// A catalog shelf's slot follows local facts only (the library, being signed in),
	// never what the catalog sends back: a shelf that loads empty keeps its height.
	// The friends shelf is the exception: with no friends reading it shrinks to one line.
	return (
		<>
			{seed && (
				<Shelf
					title={`Because you read ${seed.title}`}
					books={becauseYouRead}
					onOpen={onOpen}
					isLoading={isSimilarLoading}
					error={similarError ?? undefined}
					onRetry={() => similar.refetch()}
					emptyLabel="No close matches in the catalog yet."
				/>
			)}
			{authors.length > 0 && (
				<Shelf
					title="More by authors you read"
					books={authorBooks}
					onOpen={onOpen}
					onSeeAll={() => onBrowse({ author: authors[0], lang: "all" })}
					isLoading={isAuthorsLoading}
					error={authorsError ?? undefined}
					onRetry={() => {
						for (const q of byAuthors) if (q.error) void q.refetch();
					}}
					emptyLabel="Nothing else by your authors in the catalog yet."
				/>
			)}
			{isLoggedIn && showFriendsLine && <NoFriendsReading />}
			{isLoggedIn && !showFriendsLine && (
				<Shelf
					title="Friends are reading"
					books={friends}
					onOpen={onOpen}
					isLoading={isFeedLoading}
					error={feedError ?? undefined}
					onRetry={() => feed.refetch()}
					emptyLabel="Books your friends read show up here."
				/>
			)}
		</>
	);
};

const NoFriendsReading: React.FC = () => (
	<section
		aria-label="Friends are reading"
		className="mb-6 flex min-h-7 items-center justify-between gap-2"
	>
		<p className="m-0 min-w-0 text-muted-foreground text-xs">
			Books your friends read show up here.
		</p>
		<Button variant="ghost" size="sm" className="shrink-0" asChild>
			<Link to="/tabs/social" className="no-underline">
				<UserPlus />
				Find friends
			</Link>
		</Button>
	</section>
);

export default PersonalShelves;
