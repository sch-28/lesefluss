import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const signInWithSessionToken = vi.hoisted(() => vi.fn<(token: string) => Promise<void>>());
const requestDeviceCode = vi.hoisted(() => vi.fn());
const pollDeviceToken = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/sync-context", () => ({
	useSyncContext: () => ({ signInWithSessionToken }),
}));
vi.mock("@/hooks/use-is-foreground", () => ({ useIsForeground: () => true }));
vi.mock("@/services/social/cache", () => ({ useIsOnline: () => true }));
vi.mock("@/services/sync", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/services/sync")>();
	return { ...actual, requestDeviceCode, pollDeviceToken };
});

const { DeviceSignInError } = await import("@/services/sync");
const { useDeviceSignIn } = await import("../use-device-sign-in");

const GRANT = {
	deviceCode: "secret",
	userCode: "ABCD2345",
	verificationUrl: "https://lesefluss.app/link?user_code=ABCD2345",
	expiresAt: Date.now() + 600_000,
	intervalMs: 3_000,
};

function Harness({ isActive }: { isActive: boolean }) {
	const { state, restart } = useDeviceSignIn(isActive);
	return (
		<div>
			<output>{JSON.stringify(state)}</output>
			<button type="button" onClick={restart}>
				restart
			</button>
		</div>
	);
}

let view: Rendered | undefined;
const phase = () =>
	JSON.parse(view?.container.querySelector("output")?.textContent ?? "{}") as {
		phase: string;
		message?: string;
	};
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
	vi.useFakeTimers();
	requestDeviceCode.mockResolvedValue({ ...GRANT, expiresAt: Date.now() + 600_000 });
	signInWithSessionToken.mockResolvedValue(undefined);
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
	requestDeviceCode.mockReset();
	pollDeviceToken.mockReset();
	signInWithSessionToken.mockReset();
});

describe("useDeviceSignIn", () => {
	it("requests a code, polls at the server's interval and finishes on approval", async () => {
		pollDeviceToken
			.mockResolvedValueOnce({ status: "pending" })
			.mockResolvedValueOnce({ status: "approved", token: "session-token" });
		view = await render(<Harness isActive />);
		await advance(0);
		expect(phase().phase).toBe("waiting");
		expect(pollDeviceToken).not.toHaveBeenCalled();

		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);
		expect(phase().phase).toBe("waiting");

		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(2);
		expect(signInWithSessionToken).toHaveBeenCalledWith("session-token");
		expect(phase().phase).toBe("done");
	});

	it("backs off when told to slow down", async () => {
		pollDeviceToken.mockResolvedValueOnce({ status: "slow-down" }).mockResolvedValue({
			status: "pending",
		});
		view = await render(<Harness isActive />);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(2);
	});

	it("stops on a terminal failure and starts over on restart", async () => {
		pollDeviceToken.mockRejectedValueOnce(new DeviceSignInError("expired"));
		view = await render(<Harness isActive />);
		await advance(3_000);
		expect(phase()).toMatchObject({ phase: "failed", message: expect.stringContaining("expired") });
		await advance(10_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);

		pollDeviceToken.mockResolvedValue({ status: "pending" });
		await act(async () => {
			view?.getButton("restart").click();
		});
		await advance(0);
		expect(requestDeviceCode).toHaveBeenCalledTimes(2);
		expect(phase().phase).toBe("waiting");
	});

	it("keeps polling through a transient network failure", async () => {
		pollDeviceToken
			.mockRejectedValueOnce(new DeviceSignInError("offline"))
			.mockResolvedValue({ status: "pending" });
		view = await render(<Harness isActive />);
		await advance(3_000);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(2);
		expect(phase().phase).toBe("waiting");
	});

	it("does nothing while inactive and cancels on deactivation", async () => {
		view = await render(<Harness isActive={false} />);
		await advance(3_000);
		expect(requestDeviceCode).not.toHaveBeenCalled();

		pollDeviceToken.mockResolvedValue({ status: "pending" });
		await view.rerender(<Harness isActive />);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);

		await view.rerender(<Harness isActive={false} />);
		await advance(9_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);
	});

	it("still finishes a sign-in approved while the dialog was closing", async () => {
		let resolvePoll!: (value: unknown) => void;
		pollDeviceToken.mockReturnValueOnce(
			new Promise((resolve) => {
				resolvePoll = resolve;
			}),
		);
		view = await render(<Harness isActive />);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);

		await view.rerender(<Harness isActive={false} />);
		expect(phase().phase).toBe("requesting");
		await act(async () => {
			resolvePoll({ status: "approved", token: "session-token" });
		});
		await advance(0);
		expect(signInWithSessionToken).toHaveBeenCalledWith("session-token");
		expect(phase().phase).toBe("requesting");
	});

	it("polls once more at expiry so the server drops the code, then reports it expired", async () => {
		requestDeviceCode.mockResolvedValue({ ...GRANT, expiresAt: Date.now() + 4_000 });
		pollDeviceToken.mockResolvedValue({ status: "pending" });
		view = await render(<Harness isActive />);
		await advance(3_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(1);
		expect(phase().phase).toBe("waiting");

		await advance(1_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(2);
		expect(phase()).toMatchObject({ phase: "failed", message: expect.stringContaining("expired") });
		await advance(10_000);
		expect(pollDeviceToken).toHaveBeenCalledTimes(2);
	});
});
