import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MenuKey } from "../../components/command-palette";
import { render } from "../../test/render";
import { withKey } from "../keys";
import { type Command, registerCommands, useCommandKey } from "../registry";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

function bookmarkCommand(keys: string[]): Command {
	return { id: "reader.bookmark", title: "Bookmark here", scope: "reader", keys, run: () => {} };
}

function Hint() {
	return (
		<button
			type="button"
			title={withKey("Bookmark here", useCommandKey("reader.bookmark"), false)}
		/>
	);
}

describe("hints read their key from the registry", () => {
	it("follow a rebind and drop the key while the command is gone", async () => {
		let unregister = registerCommands(() => [bookmarkCommand(["b"])]);
		const view = await render(
			<>
				<Hint />
				<MenuKey commandId="reader.bookmark" />
			</>,
		);
		cleanups.push(view.unmount);
		const button = view.container.querySelector("button");
		expect(button?.title).toBe("Bookmark here (B)");
		expect(view.text()).toBe("B");

		await act(async () => {
			unregister();
			unregister = registerCommands(() => [bookmarkCommand(["m"])]);
		});
		expect(button?.title).toBe("Bookmark here (M)");
		expect(view.text()).toBe("M");

		await act(async () => unregister());
		expect(button?.title).toBe("Bookmark here");
		expect(view.text()).toBe("");
	});
});
