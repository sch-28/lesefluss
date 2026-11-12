import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
vi.mock("../../db", () => ({
	flushPendingSaves: vi.fn(async () => {
		order.push("flush");
	}),
}));

import {
	applyUpdate,
	appUpdateReady,
	forceUpdate,
	registerAppServiceWorker,
	resetAppUpdateForTests,
} from "..";

class FakeWorker extends EventTarget {
	state = "installing";
	postMessage = vi.fn((message: { type: string }) => order.push(`post:${message.type}`));
	become(state: string) {
		this.state = state;
		this.dispatchEvent(new Event("statechange"));
	}
}

class FakeRegistration extends EventTarget {
	installing: FakeWorker | null = null;
	waiting: FakeWorker | null = null;
	update = vi.fn(async () => {});
	find(worker: FakeWorker) {
		this.installing = worker;
		this.dispatchEvent(new Event("updatefound"));
	}
}

class FakeContainer extends EventTarget {
	controller: object | null = {};
	constructor(public registration = new FakeRegistration()) {
		super();
	}
	register = vi.fn(async () => this.registration);
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
	order.length = 0;
	resetAppUpdateForTests();
	reload = vi.fn(() => order.push("reload"));
	vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
});

afterEach(() => {
	resetAppUpdateForTests();
});

async function registered(container = new FakeContainer()) {
	await registerAppServiceWorker(container as unknown as ServiceWorkerContainer);
	return container;
}

describe("registerAppServiceWorker", () => {
	it("registers the worker for the app's base without the HTTP cache", async () => {
		const container = await registered();
		expect(container.register).toHaveBeenCalledWith("/sw.js", {
			scope: "/",
			updateViaCache: "none",
		});
	});

	it("offers the reload once a newer build is installed", async () => {
		const container = await registered();
		const worker = new FakeWorker();
		container.registration.find(worker);
		expect(appUpdateReady.get()).toBe(false);
		worker.become("installed");
		expect(appUpdateReady.get()).toBe(true);
	});

	it("offers nothing on the first install", async () => {
		const container = new FakeContainer();
		container.controller = null;
		await registered(container);
		const worker = new FakeWorker();
		container.registration.find(worker);
		worker.become("installed");
		expect(appUpdateReady.get()).toBe(false);
	});

	it("offers the reload for a build that was already waiting", async () => {
		const container = new FakeContainer();
		container.registration.waiting = new FakeWorker();
		await registered(container);
		expect(appUpdateReady.get()).toBe(true);
	});

	it("survives a refused registration", async () => {
		const container = new FakeContainer();
		container.register.mockRejectedValue(new Error("insecure"));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(registered(container)).resolves.toBe(container);
	});

	it("offers the reload when another tab moved to the new build", async () => {
		const container = await registered();
		container.dispatchEvent(new Event("controllerchange"));
		expect(appUpdateReady.get()).toBe(true);
		expect(reload).not.toHaveBeenCalled();
	});
});

describe("applyUpdate", () => {
	it("saves, activates the waiting build, then reloads", async () => {
		const container = new FakeContainer();
		const waiting = new FakeWorker();
		container.registration.waiting = waiting;
		await registered(container);
		await applyUpdate();
		container.dispatchEvent(new Event("controllerchange"));
		expect(order).toEqual(["flush", "post:SKIP_WAITING", "reload"]);
	});

	it("reloads anyway when the new build never takes over", async () => {
		vi.useFakeTimers();
		const container = new FakeContainer();
		container.registration.waiting = new FakeWorker();
		await registered(container);
		await applyUpdate();
		expect(reload).not.toHaveBeenCalled();
		vi.advanceTimersByTime(3_000);
		expect(reload).toHaveBeenCalledOnce();
	});

	it("reloads when another tab already activated the build", async () => {
		await registered();
		await applyUpdate();
		expect(order).toEqual(["flush", "reload"]);
	});
});

describe("forceUpdate", () => {
	it("fetches the newest build, saves, then activates it", async () => {
		const container = await registered();
		const worker = new FakeWorker();
		container.registration.update.mockImplementation(async () => {
			order.push("update");
			container.registration.find(worker);
		});
		const done = forceUpdate();
		await vi.waitFor(() => expect(order).toContain("update"));
		container.registration.installing = null;
		container.registration.waiting = worker;
		worker.become("installed");
		await done;
		container.dispatchEvent(new Event("controllerchange"));
		expect(order).toEqual(["update", "flush", "post:SKIP_WAITING", "reload"]);
	});

	it("reloads after saving when the server has nothing newer", async () => {
		await registered();
		await forceUpdate();
		expect(order).toEqual(["flush", "reload"]);
	});

	it("reloads after saving without a worker", async () => {
		await forceUpdate();
		expect(order).toEqual(["flush", "reload"]);
	});
});
