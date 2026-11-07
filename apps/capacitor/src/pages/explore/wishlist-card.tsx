import { useRouter } from "@tanstack/react-router";
import type React from "react";
import CoverImage from "../../components/cover-image";
import { getCoverUrl } from "../../services/catalog/client";
import { queryHooks } from "../../services/db/hooks";
import type { WishlistItem } from "../../services/db/schema";
import { InLibraryBadge, QuickAddOverlay } from "./card-badges";
import { useCatalogImport } from "./use-catalog-import";
import { useWebNovelImport } from "./use-web-novel-import";

type FrameProps = {
	item: WishlistItem;
	cover: string | null;
	onOpen: () => void;
	isInLibrary: boolean;
	/** Omitted while membership is unknown or the title is already in the library. */
	onImport?: () => void;
	isImporting: boolean;
};

const WishlistCardFrame: React.FC<FrameProps> = ({
	item,
	cover,
	onOpen,
	isInLibrary,
	onImport,
	isImporting,
}) => (
	<div className="relative w-full" data-testid="wishlist-card" data-kind={item.kind}>
		<button
			type="button"
			onClick={onOpen}
			className="flex w-full cursor-pointer select-none flex-col border-0 bg-transparent p-0 text-left text-foreground active:opacity-70"
		>
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-muted">
				<CoverImage
					src={cover}
					alt={item.title}
					fallback={
						<div className="absolute inset-0 flex items-end p-2 font-semibold text-[0.75rem] text-muted-foreground leading-tight">
							{item.title}
						</div>
					}
				/>
				{isInLibrary && <InLibraryBadge className="absolute bottom-1.5 left-1.5" />}
			</div>
			<div className="px-0.5 pt-1">
				<div
					data-clips-text
					className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]"
				>
					{item.title}
				</div>
				{item.author && (
					<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] text-muted-foreground">
						{item.author}
					</div>
				)}
			</div>
		</button>
		{onImport && <QuickAddOverlay title={item.title} isAdding={isImporting} onAdd={onImport} />}
	</div>
);

const CatalogWishlistCard: React.FC<{ item: WishlistItem }> = ({ item }) => {
	const router = useRouter();
	const { data: libraryIds } = queryHooks.useLibraryCatalogIds();
	const importer = useCatalogImport(item.ref);
	const isInLibrary = libraryIds?.has(item.ref) ?? false;
	return (
		<WishlistCardFrame
			item={item}
			cover={getCoverUrl(item.ref, item.coverUrl)}
			onOpen={() =>
				router.navigate({ to: "/tabs/explore/book/$catalogId", params: { catalogId: item.ref } })
			}
			isInLibrary={isInLibrary}
			onImport={
				libraryIds !== undefined && !isInLibrary
					? () => importer.start({ title: item.title, intent: "add" })
					: undefined
			}
			isImporting={importer.isImporting}
		/>
	);
};

const SerialWishlistCard: React.FC<{ item: WishlistItem }> = ({ item }) => {
	const router = useRouter();
	const importer = useWebNovelImport(item.ref);
	return (
		<WishlistCardFrame
			item={item}
			cover={item.coverUrl}
			onOpen={() =>
				router.navigate({ to: "/tabs/explore/web-novel-preview", search: { url: item.ref } })
			}
			isInLibrary={importer.isInLibrary}
			onImport={
				importer.isMembershipKnown && !importer.isInLibrary
					? () => importer.start(item.title)
					: undefined
			}
			isImporting={importer.isImporting}
		/>
	);
};

/** Opens the title's detail page; the corner button imports it, which takes it off the wishlist. */
const WishlistCard: React.FC<{ item: WishlistItem }> = ({ item }) =>
	item.kind === "catalog" ? (
		<CatalogWishlistCard item={item} />
	) : (
		<SerialWishlistCard item={item} />
	);

export default WishlistCard;
