import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { Switch } from "@lesefluss/ui/switch";
import { cn } from "@lesefluss/ui/utils";
import { Loader2, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	renderShareCard,
	type ShareCardData,
	type ShareCardFormat,
} from "../../services/share-card/render";
import { shareCardImage } from "../../services/share-card/share";
import { toast } from "../toast";
import { useShareHandle } from "./use-share-handle";

const FORMATS: { id: ShareCardFormat; label: string }[] = [
	{ id: "story", label: "Story" },
	{ id: "square", label: "Square" },
];

function useCardImage(data: ShareCardData, format: ShareCardFormat, showHandle: boolean) {
	const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
	useEffect(() => {
		let isCurrent = true;
		let url: string | null = null;
		setCard(null);
		renderShareCard(data, { format, showHandle })
			.then((blob) => {
				if (!isCurrent) return;
				url = URL.createObjectURL(blob);
				setCard({ blob, url });
			})
			.catch(() => {
				if (isCurrent) toast.error("Couldn't draw the card");
			});
		return () => {
			isCurrent = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [data, format, showHandle]);
	return card;
}

/** Mount it while there is a card to share; `card` must keep its identity between renders. */
export function ShareCardSheet({
	card: cardData,
	onClose,
	filename,
}: {
	card: ShareCardData;
	onClose: () => void;
	filename: string;
}) {
	const [isOpen, setIsOpen] = useState(true);
	const [format, setFormat] = useState<ShareCardFormat>("story");
	const [showHandle, setShowHandle] = useState(true);
	const [isSharing, setIsSharing] = useState(false);
	const handle = useShareHandle();
	const data = useMemo(() => ({ ...cardData, handle }), [cardData, handle]);
	const card = useCardImage(data, format, showHandle);
	const close = () => setIsOpen(false);

	const share = async () => {
		if (!card) return;
		setIsSharing(true);
		try {
			const outcome = await shareCardImage(card.blob, `${filename}-${format}.png`);
			if (outcome === "saved") toast.success("Card saved");
			if (outcome !== "cancelled") close();
		} catch {
			toast.error("Couldn't share the card");
		} finally {
			setIsSharing(false);
		}
	};

	return (
		<Drawer
			open={isOpen}
			onOpenChange={setIsOpen}
			onAnimationEnd={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent data-testid="share-card-sheet">
				<div className="flex items-center justify-between px-5 pt-2 pb-3">
					<DrawerTitle>Share card</DrawerTitle>
					<DrawerDescription className="sr-only">
						An image of these stats to share.
					</DrawerDescription>
					<SegmentedControl
						aria-label="Format"
						value={format}
						onValueChange={setFormat}
						options={FORMATS.map((f) => ({ value: f.id, label: f.label }))}
						className="w-auto"
					/>
				</div>
				<div className="flex min-h-0 flex-1 justify-center px-5">
					<div
						className={cn(
							"flex items-center justify-center overflow-hidden rounded-xl bg-muted",
							format === "story" ? "aspect-[9/16] h-[46vh]" : "aspect-square h-[34vh]",
						)}
					>
						{card ? (
							<img
								src={card.url}
								alt="Share card preview"
								draggable={false}
								className="size-full object-contain"
								data-testid="share-card-preview"
							/>
						) : (
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						)}
					</div>
				</div>
				{handle && (
					<div className="mx-5 mt-3 flex items-center justify-between text-sm">
						<span id="share-card-handle">Show @{handle}</span>
						<Switch
							aria-labelledby="share-card-handle"
							checked={showHandle}
							onCheckedChange={setShowHandle}
						/>
					</div>
				)}
				<DrawerFooter>
					<Button className="h-11" disabled={!card || isSharing} onClick={() => void share()}>
						{isSharing ? <Loader2 className="animate-spin" /> : <Share2 />}
						Share
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
