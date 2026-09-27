import {
	AVATAR_MIME_TYPES,
	avatarErrorMessage,
	BIO_MAX_LENGTH,
	DISPLAY_NAME_MAX_LENGTH,
	isProfileVisibility,
	type OwnSocialProfile,
	textValidationMessage,
	validateBio,
	validateDisplayName,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { RadioGroup, RadioGroupItem } from "@lesefluss/ui/radio-group";
import { IdentityCard, SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Switch } from "@lesefluss/ui/switch";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudOff, Loader2, Users } from "lucide-react";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Section } from "@/components/app-shell/section";
import { HandleClaimStep } from "@/components/social/handle-claim-step";
import { toast } from "@/components/toast";
import { useSyncContext } from "@/contexts/sync-context";
import {
	socialErrorBody,
	useOwnSocialProfile,
	useSetAvatarSource,
	useUpdateSocialProfile,
	useUploadAvatar,
} from "@/services/social/profile";

export const Route = createFileRoute("/tabs/settings/social")({
	component: SocialSettings,
});

function ToggleRow({
	title,
	subtitle,
	checked,
	onCheckedChange,
}: {
	title: string;
	subtitle: string;
	checked: boolean;
	onCheckedChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<div className="font-medium text-foreground text-sm">{title}</div>
				<div className="text-muted-foreground text-xs">{subtitle}</div>
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
		</div>
	);
}

function ProfileForm({ profile }: { profile: OwnSocialProfile }) {
	const update = useUpdateSocialProfile();
	const upload = useUploadAvatar();
	const setSource = useSetAvatarSource();
	const fileInput = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(profile.name);
	const [nameError, setNameError] = useState<string | null>(null);
	const [bio, setBio] = useState(profile.bio ?? "");
	const [bioError, setBioError] = useState<string | null>(null);
	const [isChangingHandle, setIsChangingHandle] = useState(false);

	const save = (patch: Parameters<typeof update.mutate>[0]) =>
		update.mutate(patch, { onError: () => toast.error("Couldn't save. Check your connection.") });

	const commitName = () => {
		const trimmed = name.trim();
		const result = validateDisplayName(trimmed);
		if (!result.ok) return setNameError(textValidationMessage("name", result.reason));
		setNameError(null);
		if (trimmed !== profile.name) save({ name: trimmed });
	};

	const commitBio = () => {
		const trimmed = bio.trim();
		const result = validateBio(trimmed);
		if (!result.ok) return setBioError(textValidationMessage("bio", result.reason));
		setBioError(null);
		if (trimmed !== (profile.bio ?? "")) save({ bio: trimmed });
	};

	const onAvatarError = (err: unknown) =>
		toast.error(avatarErrorMessage(socialErrorBody(err).reason));
	const isAvatarBusy = upload.isPending || setSource.isPending;

	const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		upload.mutate(file, { onError: onAvatarError });
	};

	return (
		<>
			<Section title="Identity">
				<div className="px-4 py-4">
					<IdentityCard name={profile.name} handle={profile.handle} avatarUrl={profile.avatarUrl} />
					<p className="mt-3 text-muted-foreground text-xs">
						Your handle, display name and avatar are shown to anyone you connect with, whatever your
						profile visibility.
					</p>
				</div>
				<Link
					to="/tabs/social/profile/$userId"
					params={{ userId: profile.userId }}
					search={{ as: "friend" }}
					className="flex w-full items-center gap-3 px-4 py-3 text-left text-foreground no-underline transition-colors hover:bg-muted/60"
				>
					<div className="min-w-0 flex-1">
						<div className="font-medium text-foreground text-sm">Preview as a friend</div>
						<div className="text-muted-foreground text-xs">
							See exactly what your friends see with the settings below.
						</div>
					</div>
				</Link>
				{isChangingHandle ? (
					<div className="px-4 py-4">
						<HandleClaimStep
							profile={profile}
							onClaimed={(claimed) => {
								// Re-confirming the same handle changes only the name, which
								// does not remount this form.
								setName(claimed.name);
								setIsChangingHandle(false);
							}}
							onSkip={() => setIsChangingHandle(false)}
							skipLabel="Cancel"
						/>
					</div>
				) : (
					<button
						type="button"
						onClick={() => setIsChangingHandle(true)}
						className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
					>
						<div className="min-w-0 flex-1">
							<div className="font-medium text-foreground text-sm">Change handle</div>
							<div className="text-muted-foreground text-xs">
								Once every 30 days. The old handle stays reserved for you for 90 days.
							</div>
						</div>
					</button>
				)}
			</Section>

			<Section title="Profile">
				<div className="flex flex-col gap-1.5 px-4 py-3">
					<label htmlFor="social-display-name" className="font-medium text-foreground text-sm">
						Display name
					</label>
					<Input
						id="social-display-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onBlur={commitName}
						maxLength={DISPLAY_NAME_MAX_LENGTH}
					/>
					{nameError && <p className="text-destructive text-xs">{nameError}</p>}
				</div>
				<div className="flex flex-col gap-1.5 px-4 py-3">
					<label htmlFor="social-bio" className="font-medium text-foreground text-sm">
						Bio
					</label>
					<textarea
						id="social-bio"
						value={bio}
						onChange={(e) => setBio(e.target.value)}
						onBlur={commitBio}
						maxLength={BIO_MAX_LENGTH}
						rows={3}
						className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
					/>
					<div className="flex justify-between text-xs">
						<span className="text-destructive">{bioError}</span>
						<span className="text-muted-foreground">
							{[...bio].length}/{BIO_MAX_LENGTH}
						</span>
					</div>
				</div>
			</Section>

			<Section title="Avatar">
				<div className="flex items-center gap-4 px-4 py-4">
					<SocialAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" />
					<div className="flex flex-1 flex-col gap-2">
						<input
							ref={fileInput}
							type="file"
							accept={AVATAR_MIME_TYPES.join(",")}
							onChange={handleFile}
							className="hidden"
						/>
						<Button
							variant="outline"
							size="sm"
							disabled={isAvatarBusy}
							onClick={() => fileInput.current?.click()}
						>
							{isAvatarBusy ? <Loader2 className="animate-spin" /> : null}
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
				</div>
				<p className="px-4 pb-3 text-muted-foreground text-xs">
					JPEG, PNG or WebP up to 5 MB. Pictures are resized and stripped of metadata.
				</p>
			</Section>

			<Section title="Profile visibility">
				<RadioGroup
					value={profile.visibility}
					onValueChange={(v) => isProfileVisibility(v) && save({ visibility: v })}
					className="gap-0"
				>
					<label
						htmlFor="social-visibility-private"
						className="flex cursor-pointer items-start gap-3 px-4 py-3"
					>
						<RadioGroupItem id="social-visibility-private" value="private" className="mt-0.5" />
						<span className="min-w-0">
							<span className="block font-medium text-foreground text-sm">Private</span>
							<span className="block text-muted-foreground text-xs">
								Only you see your bio and the sections below.
							</span>
						</span>
					</label>
					<label
						htmlFor="social-visibility-friends"
						className="flex cursor-pointer items-start gap-3 border-border border-t px-4 py-3"
					>
						<RadioGroupItem id="social-visibility-friends" value="friends" className="mt-0.5" />
						<span className="min-w-0">
							<span className="block font-medium text-foreground text-sm">Friends</span>
							<span className="block text-muted-foreground text-xs">
								Friends see your bio and the sections you leave on. There is no public option.
							</span>
						</span>
					</label>
				</RadioGroup>
			</Section>

			<Section title="Sections shown to friends">
				<ToggleRow
					title="Currently reading"
					subtitle="The books you have in progress"
					checked={profile.showCurrentlyReading}
					onCheckedChange={(v) => save({ showCurrentlyReading: v })}
				/>
				<ToggleRow
					title="Finished books"
					subtitle="Books you have completed"
					checked={profile.showFinished}
					onCheckedChange={(v) => save({ showFinished: v })}
				/>
				<ToggleRow
					title="Reading stats"
					subtitle="Time read, streaks and speed"
					checked={profile.showStats}
					onCheckedChange={(v) => save({ showStats: v })}
				/>
				<ToggleRow
					title="Shared highlights"
					subtitle="Highlights you choose to share"
					checked={profile.showHighlights}
					onCheckedChange={(v) => save({ showHighlights: v })}
				/>
			</Section>
		</>
	);
}

function SocialSettings() {
	const { isLoggedIn } = useSyncContext();
	const profileQuery = useOwnSocialProfile(isLoggedIn);

	let body: React.ReactNode;
	if (!isLoggedIn) {
		body = (
			<Section title="Not signed in">
				<p className="px-4 py-3 text-muted-foreground text-sm">
					Sign in under Cloud sync to set up your social profile.
				</p>
			</Section>
		);
	} else if (profileQuery.isPending) {
		body = (
			<div className="flex justify-center py-16">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	} else if (profileQuery.isError) {
		body = (
			<div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-8 text-center">
				<CloudOff className="size-6 text-muted-foreground" />
				<p className="text-muted-foreground text-sm">
					Can't reach the server. Your profile is only stored online, so there is nothing to show
					offline.
				</p>
				<Button variant="outline" size="sm" onClick={() => profileQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else if (!profileQuery.data.handle) {
		body = (
			<div className="mt-2 rounded-lg border border-border bg-card p-4">
				<h2 className="mb-1 font-semibold text-base text-foreground">Pick a handle</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					You need a handle before friends can find you through an invite. Nobody can see you until
					you confirm.
				</p>
				<HandleClaimStep profile={profileQuery.data} />
			</div>
		);
	} else {
		body = <ProfileForm key={profileQuery.data.handle} profile={profileQuery.data} />;
	}

	return (
		<div className="bg-background">
			<PageHeader title="Social profile" icon={Users} />
			<div className="mx-auto max-w-2xl px-4 pb-10">{body}</div>
		</div>
	);
}
