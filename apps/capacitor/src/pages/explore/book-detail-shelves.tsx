import { useQuery } from "@tanstack/react-query";
import type React from "react";
import {
	type CatalogBook,
	type CatalogSearchResult,
	getSimilarBooks,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { collapseEditions, editionKey } from "./editions";
import Shelf from "./shelf";
import { SHELF_STALE_TIME_MS, useAuthorBooks } from "./use-author-books";

const AUTHOR_SHELF_SIZE = 12;

type Props = {
	book: CatalogBook;
	onOpen: (result: CatalogSearchResult) => void;
	onSeeAuthor: (author: string) => void;
};

/** "More by this author" and "Similar books"; each hides itself when it has nothing to show. */
const BookDetailShelves: React.FC<Props> = ({ book, onOpen, onSeeAuthor }) => {
	const author = book.author;
	const byAuthorQuery = useAuthorBooks(author, AUTHOR_SHELF_SIZE);
	const ownKey = editionKey(book.title, book.author);
	const byAuthor = byAuthorQuery.data
		? collapseEditions(byAuthorQuery.data.results).filter(
				(r) => r.id !== book.id && editionKey(r.title, r.author) !== ownKey,
			)
		: undefined;
	const similar = useQuery({
		queryKey: catalogKeys.similar(book.id),
		queryFn: ({ signal }) => getSimilarBooks(book.id, signal),
		staleTime: SHELF_STALE_TIME_MS,
		select: (data) => data.results,
	});

	return (
		<div className="mt-6">
			{author && byAuthor && byAuthor.length > 0 && (
				<Shelf
					title={`More by ${author}`}
					books={byAuthor}
					onOpen={onOpen}
					onSeeAll={() => onSeeAuthor(author)}
				/>
			)}
			{similar.data && similar.data.length > 0 && (
				<Shelf title="Similar books" books={similar.data} onOpen={onOpen} />
			)}
		</div>
	);
};

export default BookDetailShelves;
