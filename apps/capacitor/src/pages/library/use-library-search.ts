import { useCallback, useState } from "react";
import { useBackHandler } from "../../hooks/use-back-handler";

/**
 * The library search bar. Its query is deliberately not persisted: a query
 * restored into a collapsed search bar would look like an empty library with
 * no visible cause. Android back closes an open search (and clears it) before
 * the router may leave the library or exit the app.
 */
export function useLibrarySearch() {
	const [search, setSearch] = useState("");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const closeSearch = useCallback(() => {
		setSearch("");
		setIsSearchOpen(false);
	}, []);
	const toggleSearch = useCallback(() => {
		setIsSearchOpen((open) => !open);
		setSearch("");
	}, []);
	useBackHandler(isSearchOpen, closeSearch);
	return { search, setSearch, isSearchOpen, setIsSearchOpen, closeSearch, toggleSearch };
}
