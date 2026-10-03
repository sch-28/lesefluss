import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncContext } from "@/contexts/sync-context";
import { useIsForeground } from "@/hooks/use-is-foreground";
import { useIsOnline } from "@/services/social/cache";
import {
	type DeviceCodeGrant,
	type DevicePollResult,
	DeviceSignInError,
	pollDeviceToken,
	requestDeviceCode,
	SIGN_IN_FAILED_MESSAGE,
} from "@/services/sync";

export type DeviceSignInState =
	| { phase: "requesting" }
	| { phase: "waiting"; grant: DeviceCodeGrant }
	| { phase: "finishing"; grant: DeviceCodeGrant }
	| { phase: "done" }
	| { phase: "failed"; grant: DeviceCodeGrant | null; message: string };

const INITIAL_STATE: DeviceSignInState = { phase: "requesting" };

/**
 * Runs one device-link attempt while `isActive`: requests a code, then polls
 * the server at its interval until the code is approved, denied or expired,
 * and finishes the sign-in. Polling pauses while the app is backgrounded or
 * offline; the code keeps counting down meanwhile, as it does on the server.
 */
export function useDeviceSignIn(isActive: boolean): {
	state: DeviceSignInState;
	restart: () => void;
} {
	const { signInWithSessionToken } = useSyncContext();
	const isForeground = useIsForeground();
	const isOnline = useIsOnline();
	const canPollRef = useRef(true);
	const signInRef = useRef(signInWithSessionToken);
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<DeviceSignInState>(INITIAL_STATE);

	useEffect(() => {
		canPollRef.current = isForeground && isOnline;
	}, [isForeground, isOnline]);
	useEffect(() => {
		signInRef.current = signInWithSessionToken;
	}, [signInWithSessionToken]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` restarts the loop on purpose
	useEffect(() => {
		if (!isActive) return;
		let isCancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const fail = (grant: DeviceCodeGrant | null, err: unknown) =>
			setState({
				phase: "failed",
				grant,
				message: err instanceof Error ? err.message : SIGN_IN_FAILED_MESSAGE,
			});

		void (async () => {
			let grant: DeviceCodeGrant;
			try {
				grant = await requestDeviceCode();
			} catch (err) {
				if (!isCancelled) fail(null, err);
				return;
			}
			if (isCancelled) return;
			setState({ phase: "waiting", grant });
			let intervalMs = grant.intervalMs;

			function schedule() {
				// Never sleep past expiry: the poll after it makes the server drop the code.
				const untilExpiry = Math.max(0, grant.expiresAt - Date.now());
				timer = setTimeout(tick, Math.min(intervalMs, untilExpiry));
			}

			async function tick() {
				if (isCancelled) return;
				const isPastExpiry = Date.now() >= grant.expiresAt;
				if (!canPollRef.current && !isPastExpiry) {
					schedule();
					return;
				}
				let result: DevicePollResult;
				try {
					result = await pollDeviceToken(grant.deviceCode);
				} catch (err) {
					if (isCancelled) return;
					if (err instanceof DeviceSignInError && err.reason === "offline" && !isPastExpiry) {
						schedule();
						return;
					}
					fail(grant, isPastExpiry ? new DeviceSignInError("expired") : err);
					return;
				}
				if (result.status !== "approved") {
					if (isCancelled) return;
					if (isPastExpiry) {
						fail(grant, new DeviceSignInError("expired"));
						return;
					}
					if (result.status === "slow-down") intervalMs *= 2;
					schedule();
					return;
				}
				// The server has minted the session and dropped the code; finishing
				// after a cancel is still right, leaving it would orphan that session.
				if (!isCancelled) setState({ phase: "finishing", grant });
				try {
					await signInRef.current(result.token);
					if (!isCancelled) setState({ phase: "done" });
				} catch (err) {
					if (!isCancelled) fail(grant, err);
				}
			}

			schedule();
		})();

		return () => {
			isCancelled = true;
			if (timer) clearTimeout(timer);
			// A reopened dialog must not flash the previous attempt's code.
			setState(INITIAL_STATE);
		};
	}, [isActive, attempt]);

	const restart = useCallback(() => setAttempt((n) => n + 1), []);
	return { state, restart };
}
