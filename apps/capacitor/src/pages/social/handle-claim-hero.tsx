import type { OwnSocialProfile } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { AtSign } from "lucide-react";
import { useState } from "react";
import { HandleClaimStep } from "@/components/social/handle-claim-step";
import { HowItWorks, TrailerCard } from "./first-run-hero";

/** Same first impression as the first-run hero; the handle form only opens on request. */
export function HandleClaimHero({
	profile,
	onClaimed,
}: {
	profile: OwnSocialProfile;
	onClaimed?: (profile: OwnSocialProfile) => void;
}) {
	const [isClaiming, setIsClaiming] = useState(false);
	return (
		<>
			<TrailerCard self={{ name: profile.name, avatarUrl: profile.avatarUrl }}>
				{isClaiming ? (
					<div className="mt-5">
						<h2 className="m-0 mb-4 font-bold text-[22px] text-foreground leading-tight tracking-tight">
							Pick a handle
						</h2>
						<HandleClaimStep
							profile={profile}
							onClaimed={onClaimed}
							onSkip={() => setIsClaiming(false)}
							skipLabel="Back"
							focusOnMount
						/>
					</div>
				) : (
					<>
						<h2 className="m-0 mt-5 font-bold text-[26px] text-foreground leading-tight tracking-tight">
							Read together, wherever you are.
						</h2>
						<p className="m-0 mt-2.5 text-[14.5px] text-muted-foreground leading-relaxed">
							First, pick a handle. Friends will know you by it, and nobody can see you until you
							confirm.
						</p>
						<Button
							size="lg"
							className="mt-5 h-12 w-full rounded-xl text-[15px]"
							onClick={() => setIsClaiming(true)}
						>
							<AtSign /> Pick your handle
						</Button>
					</>
				)}
			</TrailerCard>
			<HowItWorks />
		</>
	);
}
