import { SOCIAL_API } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../sync/auth-client", () => ({ SYNC_URL: "" }));
vi.mock("../../sync/session", () => ({ SYNC_ENABLED: true }));

const { useSignedOutInvitePreview } = await import("../friends");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.unstubAllGlobals();
});

function Probe() {
	const preview = useSignedOutInvitePreview("tok");
	return <p>{preview.data?.state ?? "none"}</p>;
}

describe("useSignedOutInvitePreview", () => {
	it("asks the same origin in the web build, which has no sync URL", async () => {
		const fetchMock = vi.fn(async () => Response.json({ state: "invalid" }));
		vi.stubGlobal("fetch", fetchMock);

		view = await render(<Probe />);

		await vi.waitFor(() => expect(view?.text()).toBe("invalid"));
		expect(fetchMock).toHaveBeenCalledWith(
			SOCIAL_API.invitePreviewSignedOut,
			expect.objectContaining({ method: "POST", credentials: "omit" }),
		);
	});
});
