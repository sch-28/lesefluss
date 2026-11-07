import { Button } from "@lesefluss/ui/button";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import type React from "react";
import { SpeedTest } from "../../components/speed-test/speed-test";

/** The speed test, full screen, from the Speed tab. */
const SpeedTestPage: React.FC = () => {
	const router = useRouter();
	const navigate = useNavigate();
	const close = () =>
		router.history.canGoBack()
			? router.history.back()
			: void navigate({ to: "/tabs/library/stats", search: { tab: "speed" }, replace: true });

	return (
		<div
			className="flex h-[100dvh] flex-col bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)] text-foreground"
			data-testid="speed-test-page"
		>
			<div className="flex h-12 items-center justify-end px-4">
				<Button variant="ghost" size="icon" onClick={close} aria-label="Close">
					<X className="size-5" />
				</Button>
			</div>
			<main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
				<div className="mx-auto my-auto w-full max-w-md">
					<SpeedTest onSkip={close} onFinish={close} skipLabel="Not now" finishLabel="Done" />
				</div>
			</main>
		</div>
	);
};

export default SpeedTestPage;
