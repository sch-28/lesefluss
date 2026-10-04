import {
	DISPLAY_NAME_MAX_LENGTH,
	HANDLE_CHECK_DEBOUNCE_MS,
	HANDLE_MAX_LENGTH,
	type HandleCheckState,
	handleClaimFailureMessage,
	normalizeHandle,
	type OwnSocialProfile,
	textValidationMessage,
	validateDisplayName,
	validateHandle,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { IdentityCard } from "@lesefluss/ui/social-avatar";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useIsOnline } from "@/services/social/cache";
import {
	checkHandle,
	claimFailure,
	socialErrorBody,
	useClaimHandle,
} from "@/services/social/profile";

/**
 * Picks a handle and display name and shows exactly what other users will see
 * before anything is committed.
 */
export function HandleClaimStep({
	profile,
	onClaimed,
	onSkip,
	skipLabel = "Not now",
	focusOnMount = false,
}: {
	profile: OwnSocialProfile;
	onClaimed?: (profile: OwnSocialProfile) => void;
	onSkip?: () => void;
	skipLabel?: string;
	focusOnMount?: boolean;
}) {
	const handleInputRef = useRef<HTMLInputElement>(null);
	const [handle, setHandle] = useState(profile.handle ?? "");
	const [name, setName] = useState(profile.name);
	const [isNameTouched, setIsNameTouched] = useState(false);
	const [check, setCheck] = useState<HandleCheckState | null>(null);
	const claim = useClaimHandle();
	const isOnline = useIsOnline();

	useEffect(() => {
		if (focusOnMount) handleInputRef.current?.focus();
	}, [focusOnMount]);

	const handleValidation = validateHandle(handle);
	const isCurrentHandle = profile.handle !== null && normalizeHandle(handle) === profile.handle;
	const needsCheck = handle !== "" && !isCurrentHandle && handleValidation.ok;

	useEffect(() => {
		if (!needsCheck) return;
		setCheck({ state: "checking" });
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const result = await checkHandle(handle);
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
					retryAfterDays: socialErrorBody(err).retryAfterDays,
				});
			}
		}, HANDLE_CHECK_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [handle, needsCheck]);

	const availability: HandleCheckState | null =
		handle === "" || isCurrentHandle
			? null
			: handleValidation.ok
				? check
				: { state: "unavailable", reason: "invalid" };

	const nameValidation = validateDisplayName(name.trim());
	const nameError =
		isNameTouched && !nameValidation.ok
			? textValidationMessage("name", nameValidation.reason)
			: null;
	const canSubmit =
		handleValidation.ok &&
		(availability?.state === "available" || isCurrentHandle) &&
		nameValidation.ok &&
		isOnline &&
		!claim.isPending;

	const submitError = claim.isError
		? handleClaimFailureMessage(
				claimFailure(claim.error),
				socialErrorBody(claim.error).retryAfterDays,
			)
		: null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setIsNameTouched(true);
		if (!canSubmit) return;
		claim.mutate({ handle, name: name.trim() }, { onSuccess: (p) => onClaimed?.(p) });
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<label htmlFor="social-handle" className="font-medium text-foreground text-sm">
					Handle
				</label>
				<div className="relative">
					<span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm">
						@
					</span>
					<Input
						ref={handleInputRef}
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

			<div className="flex flex-col gap-1.5">
				<label htmlFor="social-name" className="font-medium text-foreground text-sm">
					Display name
				</label>
				<Input
					id="social-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => setIsNameTouched(true)}
					maxLength={DISPLAY_NAME_MAX_LENGTH}
				/>
				{nameError && <p className="text-destructive text-xs">{nameError}</p>}
			</div>

			<div className="rounded-lg border border-border bg-card p-4">
				<p className="mb-3 text-muted-foreground text-xs">
					This is what other users will see. Nothing is visible until you confirm.
				</p>
				<IdentityCard
					name={name.trim()}
					handle={handleValidation.ok ? normalizeHandle(handle) : null}
					avatarUrl={profile.avatarUrl}
				/>
			</div>

			{submitError && <p className="text-destructive text-sm">{submitError}</p>}

			<div className="flex gap-2">
				<Button type="submit" disabled={!canSubmit} className="flex-1">
					{claim.isPending ? "Saving…" : profile.handle ? "Change handle" : "Confirm"}
				</Button>
				{onSkip && (
					<Button type="button" variant="ghost" onClick={onSkip}>
						{skipLabel}
					</Button>
				)}
			</div>
		</form>
	);
}
