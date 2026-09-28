import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useRelationships } from "@/services/social/friends";

/**
 * Picks several friends at once, for starting a buddy read and inviting to
 * one. `blocker` replaces the list with the reason nothing can be picked.
 */
export function FriendPickerSheet({
	isOpen,
	onClose,
	title,
	intro,
	blocker,
	excludeIds = [],
	maxSelected,
	allowEmpty = false,
	submitLabel,
	pendingLabel,
	isPending,
	error,
	onSubmit,
}: {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	intro: React.ReactNode;
	blocker?: string | null;
	excludeIds?: readonly string[];
	maxSelected: number;
	allowEmpty?: boolean;
	submitLabel: string;
	pendingLabel: string;
	isPending: boolean;
	error: string | null;
	onSubmit: (userIds: string[]) => void;
}) {
	const relationships = useRelationships(isOpen && !blocker);
	const [selected, setSelected] = useState<string[]>([]);
	useEffect(() => {
		if (isOpen) setSelected([]);
	}, [isOpen]);

	const friends = (relationships.data?.friends ?? []).filter((f) => !excludeIds.includes(f.userId));
	const isFull = selected.length >= maxSelected;
	const toggle = (userId: string) =>
		setSelected((current) =>
			current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
		);
	const canPick = !blocker && relationships.isSuccess;
	const canSubmit =
		canPick && !isPending && (allowEmpty || selected.length > 0) && selected.length <= maxSelected;

	return (
		<Drawer
			open={isOpen}
			dismissible={!isPending}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="truncate">{title}</DrawerTitle>
				</DrawerHeader>
				<div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-4 pb-2">
					{blocker ? (
						<p className="m-0 text-muted-foreground text-sm">{blocker}</p>
					) : relationships.isPending ? (
						<p className="m-0 text-muted-foreground text-sm">Loading your friends…</p>
					) : relationships.isError ? (
						<div className="flex flex-col gap-2">
							<p className="m-0 text-muted-foreground text-sm">Couldn't load your friends.</p>
							<Button variant="outline" size="sm" onClick={() => void relationships.refetch()}>
								Retry
							</Button>
						</div>
					) : (
						<>
							<div className="m-0 text-muted-foreground text-xs">{intro}</div>
							{friends.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-4 text-center">
									<Users className="size-6 text-muted-foreground" />
									<p className="m-0 text-muted-foreground text-sm">
										No friends left to invite. Add friends from the Social tab.
									</p>
									<Button asChild variant="outline" size="sm" onClick={onClose}>
										<Link to="/tabs/social">Open Social</Link>
									</Button>
								</div>
							) : (
								<fieldset className="flex flex-col">
									{friends.map((friend) => {
										const isChecked = selected.includes(friend.userId);
										return (
											<label
												key={friend.userId}
												className="flex items-center gap-3 rounded-md px-1 py-2 text-sm has-[:checked]:bg-muted"
											>
												<input
													type="checkbox"
													checked={isChecked}
													onChange={() => toggle(friend.userId)}
													disabled={isPending || (!isChecked && isFull)}
												/>
												<SocialAvatar name={friend.name} avatarUrl={friend.avatarUrl} size="md" />
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium text-foreground">
														{friend.name}
													</span>
													<span className="block truncate text-muted-foreground text-xs">
														@{friend.handle}
													</span>
												</span>
											</label>
										);
									})}
								</fieldset>
							)}
							{isFull && (
								<p className="m-0 text-muted-foreground text-xs">
									That's everyone who fits: a buddy read holds 8 people, pending invites included.
								</p>
							)}
							{error && (
								<p className="m-0 text-destructive text-sm" role="alert">
									{error}
								</p>
							)}
						</>
					)}
				</div>
				<DrawerFooter className="flex-row gap-2">
					<Button variant="outline" className="flex-1" disabled={isPending} onClick={onClose}>
						{canPick ? "Cancel" : "Close"}
					</Button>
					{canPick && (
						<Button className="flex-1" disabled={!canSubmit} onClick={() => onSubmit(selected)}>
							{isPending ? pendingLabel : submitLabel}
						</Button>
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
