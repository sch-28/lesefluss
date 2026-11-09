import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import type React from "react";
import CoverImage from "../../components/cover-image";
import { getCoverUrl } from "../../services/catalog/client";
import { queryHooks } from "../../services/db/hooks";
import type { WishlistItem } from "../../services/db/schema";
import { CardMeta, QUICK_ADD_CLEARANCE, QuickAddBesideTitle } from "./card-badges";
import { useCatalogImport } from "./use-catalog-import";
import { useWebNovelImport } from "./use-web-novel-import";
import { useRemoveFromWishlist } from "./use-wishlist-action";

type FrameProps = {
	item: WishlistItem;
	cover: string | null;
	onOpen: () => void;
	isInLibrary: boolean;
	/** Omitted while membership is unknown or the title is already in the library. */
	onImport?: () => void;
	isImporting: boolean;
};

const RemoveFromWishlistButton: React.FC<{ item: WishlistItem }> = ({ item }) => {
	const removal = useRemoveFromWishlist();
	return (
		<button
			type="button"
			aria-label={`Remove ${item.title} from wishlist`}
			disabled={removal.isPending}
			onClick={() => removal.remove(item)}
			className="pointer-events-auto absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur active:opacity-70 disabled:opacity-70"
		>
			<X className="size-4" aria-hidden />
		</button>
	);
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
			</div>
			<div className={`px-0.5 pt-1 ${onImport ? QUICK_ADD_CLEARANCE : ""}`}>
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
				<CardMeta isInLibrary={isInLibrary} />
			</div>
		</button>
		<div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">
			<RemoveFromWishlistButton item={item} />
		</div>
		{onImport && <QuickAddBesideTitle title={item.title} isAdding={isImporting} onAdd={onImport} />}
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

/** Opens the title's detail page; the corner buttons remove it, or import it, which also takes it off the wishlist. */
const WishlistCard: React.FC<{ item: WishlistItem }> = ({ item }) =>
	item.kind === "catalog" ? (
		<CatalogWishlistCard item={item} />
	) : (
		<SerialWishlistCard item={item} />
	);

export default WishlistCard;
