import {
	AVATAR_MIME_TYPES,
	avatarErrorMessage,
	BIO_MAX_LENGTH,
	DISPLAY_NAME_MAX_LENGTH,
	HANDLE_CHECK_DEBOUNCE_MS,
	HANDLE_MAX_LENGTH,
	type HandleCheckState,
	handleClaimFailureMessage,
	isProfileVisibility,
	normalizeHandle,
	type OwnSocialProfile,
	textValidationMessage,
	validateBio,
	validateDisplayName,
	validateHandle,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { RadioGroup, RadioGroupItem } from "@lesefluss/ui/radio-group";
import { IdentityCard, SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Switch } from "@lesefluss/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { claimFailure, errorReason, retryAfterDays, socialClient } from "~/lib/social-client";

export const PROFILE_KEY = ["social", "own-profile"] as const;

function useProfileMutation<TVariables>(run: (v: TVariables) => Promise<OwnSocialProfile>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
	});
}

export function HandleClaimForm({
	profile,
	onDone,
	onCancel,
}: {
	profile: OwnSocialProfile;
	onDone?: (profile: OwnSocialProfile) => void;
	onCancel?: () => void;
}) {
	const [handle, setHandle] = React.useState(profile.handle ?? "");
	const [name, setName] = React.useState(profile.name);
	const [check, setCheck] = React.useState<HandleCheckState | null>(null);
	const claim = useProfileMutation(socialClient.claimHandle);

	const isHandleValid = validateHandle(handle).ok;
	const isCurrent = profile.handle !== null && normalizeHandle(handle) === profile.handle;
	const needsCheck = handle !== "" && !isCurrent && isHandleValid;

	React.useEffect(() => {
		if (!needsCheck) return;
		setCheck({ state: "checking" });
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const result = await socialClient.checkHandle(handle);
				if (cancelled) return;
				setCheck(
					result.available
						? { state: "available" }
						: {
								state: "unavailable",
								reason: result.reason,
								retryAfterDays: result.retryAfterDays,
							},
				);
			} catch (err) {
				if (cancelled) return;
				setCheck({
					state: "unavailable",
					reason: claimFailure(err),
					retryAfterDays: retryAfterDays(err),
				});
			}
		}, HANDLE_CHECK_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [handle, needsCheck]);

	const availability: HandleCheckState | null =
		handle === "" || isCurrent
			? null
			: isHandleValid
				? check
				: { state: "unavailable", reason: "invalid" };

	const isNameValid = validateDisplayName(name.trim()).ok;
	const canSubmit =
		isHandleValid &&
		(availability?.state === "available" || isCurrent) &&
		isNameValid &&
		!claim.isPending;

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (!canSubmit) return;
				claim.mutate({ handle, name: name.trim() }, { onSuccess: onDone });
			}}
		>
			<div className="space-y-1.5">
				<label htmlFor="social-handle" className="font-medium text-sm">
					Handle
				</label>
				<div className="relative">
					<span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm">
						@
					</span>
					<Input
						id="social-handle"
						value={handle}
						onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))}
						maxLength={HANDLE_MAX_LENGTH}
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						className="pl-7"
						placeholder="yourname"
					/>
					{availability?.state === "checking" && (
						<Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
					)}
				</div>
				<p
					className={
						availability?.state === "unavailable"
							? "text-destructive text-xs"
							: "text-muted-foreground text-xs"
					}
				>
					{availability?.state === "unavailable"
						? handleClaimFailureMessage(availability.reason, availability.retryAfterDays)
						: availability?.state === "available"
							? "Available."
							: "Letters, digits and underscores. Shown as @handle. Not searchable."}
				</p>
			</div>
			<div className="space-y-1.5">
				<label htmlFor="social-claim-name" className="font-medium text-sm">
					Display name
				</label>
				<Input
					id="social-claim-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={DISPLAY_NAME_MAX_LENGTH}
				/>
				{!isNameValid && (
					<p className="text-destructive text-xs">Enter a name of up to 50 characters.</p>
				)}
			</div>
			<div className="rounded-lg border border-border bg-card p-4">
				<p className="mb-3 text-muted-foreground text-xs">
					This is what other users will see. Nothing is visible until you confirm.
				</p>
				<IdentityCard
					name={name.trim()}
					handle={isHandleValid ? normalizeHandle(handle) : null}
					avatarUrl={profile.avatarUrl}
				/>
			</div>
			{claim.isError && (
				<p className="text-destructive text-sm">
					{handleClaimFailureMessage(claimFailure(claim.error), retryAfterDays(claim.error))}
				</p>
			)}
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={!canSubmit}>
					{claim.isPending ? "Saving…" : profile.handle ? "Change handle" : "Confirm"}
				</Button>
				{onCancel && (
					<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
						Cancel
					</Button>
				)}
			</div>
		</form>
	);
}

function ToggleRow({
	id,
	title,
	checked,
	onCheckedChange,
}: {
	id: string;
	title: string;
	checked: boolean;
	onCheckedChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 py-2">
			<label htmlFor={id} className="text-sm">
				{title}
			</label>
			<Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
		</div>
	);
}

function ProfileEditor({ profile }: { profile: OwnSocialProfile }) {
	const update = useProfileMutation(socialClient.updateProfile);
	const upload = useProfileMutation(socialClient.uploadAvatar);
	const setSource = useProfileMutation(socialClient.setAvatarSource);
	const fileInput = React.useRef<HTMLInputElement>(null);
	const [name, setName] = React.useState(profile.name);
	const [bio, setBio] = React.useState(profile.bio ?? "");
	const [error, setError] = React.useState<string | null>(null);
	const [isChangingHandle, setIsChangingHandle] = React.useState(false);

	const save = (patch: Parameters<typeof socialClient.updateProfile>[0]) => {
		setError(null);
		update.mutate(patch, { onError: () => setError("Couldn't save. Please try again.") });
	};
	const onAvatarError = (err: unknown) => setError(avatarErrorMessage(errorReason(err)));
	const isAvatarBusy = upload.isPending || setSource.isPending;

	const commitName = () => {
		const trimmed = name.trim();
		const result = validateDisplayName(trimmed);
		if (!result.ok) return setError(textValidationMessage("name", result.reason));
		if (trimmed !== profile.name) save({ name: trimmed });
	};
	const commitBio = () => {
		const trimmed = bio.trim();
		const result = validateBio(trimmed);
		if (!result.ok) return setError(textValidationMessage("bio", result.reason));
		if (trimmed !== (profile.bio ?? "")) save({ bio: trimmed });
	};

	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<IdentityCard name={profile.name} handle={profile.handle} avatarUrl={profile.avatarUrl} />
				<p className="text-muted-foreground text-sm">
					Your handle, display name and avatar are shown to anyone you connect with, whatever your
					profile visibility.
				</p>
				{isChangingHandle ? (
					<HandleClaimForm
						profile={profile}
						onDone={(claimed) => {
							// Re-confirming the same handle changes only the name, which does
							// not remount this editor.
							setName(claimed.name);
							setIsChangingHandle(false);
						}}
						onCancel={() => setIsChangingHandle(false)}
					/>
				) : (
					<Button variant="outline" size="sm" onClick={() => setIsChangingHandle(true)}>
						Change handle
					</Button>
				)}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<label htmlFor="social-name" className="font-medium text-sm">
						Display name
					</label>
					<Input
						id="social-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onBlur={commitName}
						maxLength={DISPLAY_NAME_MAX_LENGTH}
					/>
				</div>
				<div className="space-y-1.5">
					<label htmlFor="social-bio" className="font-medium text-sm">
						Bio
					</label>
					<textarea
						id="social-bio"
						value={bio}
						onChange={(e) => setBio(e.target.value)}
						onBlur={commitBio}
						maxLength={BIO_MAX_LENGTH}
						rows={2}
						className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
					/>
					<p className="text-right text-muted-foreground text-xs">
						{[...bio].length}/{BIO_MAX_LENGTH}
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<p className="font-medium text-sm">Avatar</p>
				<div className="flex flex-wrap items-center gap-3">
					<SocialAvatar name={profile.name} avatarUrl={profile.avatarUrl} />
					<input
						ref={fileInput}
						type="file"
						accept={AVATAR_MIME_TYPES.join(",")}
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file) upload.mutate(file, { onError: onAvatarError });
						}}
					/>
					<Button
						variant="outline"
						size="sm"
						disabled={isAvatarBusy}
						onClick={() => fileInput.current?.click()}
					>
						{profile.avatarUrl ? "Replace picture" : "Upload picture"}
					</Button>
					{profile.hasAccountPicture && (
						<Button
							variant="outline"
							size="sm"
							disabled={isAvatarBusy}
							onClick={() => setSource.mutate({ source: "account" }, { onError: onAvatarError })}
						>
							Use my account picture
						</Button>
					)}
					{profile.avatarUrl && (
						<Button
							variant="ghost"
							size="sm"
							disabled={isAvatarBusy}
							onClick={() => setSource.mutate({ source: "none" }, { onError: onAvatarError })}
						>
							Remove picture
						</Button>
					)}
				</div>
				<p className="text-muted-foreground text-xs">
					JPEG, PNG or WebP up to 5 MB. Pictures are resized and stripped of metadata.
				</p>
			</div>

			<div className="space-y-2">
				<p className="font-medium text-sm">Profile visibility</p>
				<RadioGroup
					value={profile.visibility}
					onValueChange={(v) => isProfileVisibility(v) && save({ visibility: v })}
				>
					<label htmlFor="social-visibility-private" className="flex cursor-pointer gap-3">
						<RadioGroupItem id="social-visibility-private" value="private" className="mt-1" />
						<span className="text-sm">
							<span className="font-medium">Private</span>
							<span className="block text-muted-foreground text-xs">
								Only you see your bio and the sections below.
							</span>
						</span>
					</label>
					<label htmlFor="social-visibility-friends" className="flex cursor-pointer gap-3">
						<RadioGroupItem id="social-visibility-friends" value="friends" className="mt-1" />
						<span className="text-sm">
							<span className="font-medium">Friends</span>
							<span className="block text-muted-foreground text-xs">
								Friends see your bio and the sections you leave on. There is no public option.
							</span>
						</span>
					</label>
				</RadioGroup>
			</div>

			<div>
				<p className="mb-1 font-medium text-sm">Sections shown to friends</p>
				<div className="divide-y divide-border">
					<ToggleRow
						id="social-show-reading"
						title="Currently reading"
						checked={profile.showCurrentlyReading}
						onCheckedChange={(v) => save({ showCurrentlyReading: v })}
					/>
					<ToggleRow
						id="social-show-finished"
						title="Finished books"
						checked={profile.showFinished}
						onCheckedChange={(v) => save({ showFinished: v })}
					/>
					<ToggleRow
						id="social-show-stats"
						title="Reading stats"
						checked={profile.showStats}
						onCheckedChange={(v) => save({ showStats: v })}
					/>
					<ToggleRow
						id="social-show-highlights"
						title="Shared highlights"
						checked={profile.showHighlights}
						onCheckedChange={(v) => save({ showHighlights: v })}
					/>
				</div>
			</div>

			{error && (
				<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-destructive text-sm">
					{error}
				</p>
			)}
		</div>
	);
}

export function SocialProfileSection() {
	const profile = useQuery({
		queryKey: PROFILE_KEY,
		queryFn: socialClient.getOwnProfile,
		retry: 1,
	});

	let body: React.ReactNode;
	if (profile.isPending) {
		body = <Loader2 className="size-5 animate-spin text-muted-foreground" />;
	} else if (profile.isError) {
		body = (
			<div className="flex items-center gap-3">
				<p className="text-muted-foreground text-sm">Couldn't load your social profile.</p>
				<Button variant="outline" size="sm" onClick={() => profile.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else if (!profile.data.handle) {
		body = (
			<div className="space-y-4">
				<p className="text-muted-foreground text-sm">
					Pick a handle to use social features in the app. Nobody can see you until you confirm.
				</p>
				<HandleClaimForm profile={profile.data} />
			</div>
		);
	} else {
		body = <ProfileEditor key={profile.data.handle} profile={profile.data} />;
	}

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-base">Social profile</h2>
			{body}
		</section>
	);
}
