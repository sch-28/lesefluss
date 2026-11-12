import { createFlag } from "../../commands/signal";
import { log } from "../../utils/log";
import { flushPendingSaves } from "../db";

/** A newer build is installed and waits for this tab to reload into it. */
export const appUpdateReady = createFlag();

const UPDATE_CHECK_MIN_MS = 10 * 60_000;
const ACTIVATE_TIMEOUT_MS = 3_000;
const FORCED_INSTALL_TIMEOUT_MS = 15_000;

let registration: ServiceWorkerRegistration | null = null;
let container: ServiceWorkerContainer | null = null;
let reloadRequested = false;
let lastCheck = 0;

function reloadPage() {
	window.location.reload();
}

function watchInstalling(reg: ServiceWorkerRegistration, sw: ServiceWorkerContainer) {
	const worker = reg.installing;
	worker?.addEventListener("statechange", () => {
		// Without a controller this is the first install: nothing older runs to replace.
		if (worker.state === "installed" && sw.controller) appUpdateReady.set(true);
	});
}

async function checkForUpdate() {
	if (!registration || Date.now() - lastCheck < UPDATE_CHECK_MIN_MS) return;
	lastCheck = Date.now();
	await registration.update().catch(() => {});
}

/**
 * Registers the web build's service worker (LESE-20.7). The worker keeps the app
 * shell for offline starts; a newer build waits in it until the user reloads
 * from the update bar, so a deploy never swaps the code under an open book.
 */
export async function registerAppServiceWorker(
	sw: ServiceWorkerContainer | undefined = navigator.serviceWorker,
): Promise<void> {
	if (!sw) return;
	try {
		const base = import.meta.env.BASE_URL;
		const reg = await sw.register(`${base}sw.js`, { scope: base, updateViaCache: "none" });
		registration = reg;
		container = sw;
		lastCheck = Date.now();
		if (reg.waiting && sw.controller) appUpdateReady.set(true);
		reg.addEventListener("updatefound", () => watchInstalling(reg, sw));
		sw.addEventListener("controllerchange", () => {
			// Another tab reloaded into the new build; this one still runs the old code.
			if (reloadRequested) reloadPage();
			else appUpdateReady.set(true);
		});
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") void checkForUpdate();
		});
	} catch (err) {
		log.warn("app-update", "service worker registration failed:", err);
	}
}

function activateWaiting(waiting: ServiceWorker | null | undefined) {
	if (!waiting || !container) {
		reloadPage();
		return;
	}
	reloadRequested = true;
	waiting.postMessage({ type: "SKIP_WAITING" });
	setTimeout(reloadPage, ACTIVATE_TIMEOUT_MS);
}

/** The update bar's Reload: saves first, then reloads into the waiting build. */
export async function applyUpdate(): Promise<void> {
	if (reloadRequested) return;
	await flushPendingSaves();
	activateWaiting(registration?.waiting);
}

function waitForInstalled(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(reg.waiting), FORCED_INSTALL_TIMEOUT_MS);
		const done = () => {
			clearTimeout(timer);
			resolve(reg.waiting);
		};
		const watch = () => {
			const worker = reg.installing;
			if (!worker) return done();
			worker.addEventListener("statechange", () => {
				if (worker.state === "installed" || worker.state === "redundant") done();
			});
		};
		if (reg.installing) watch();
		else reg.addEventListener("updatefound", watch, { once: true });
		reg.update().then(() => {
			if (!reg.installing) done();
		}, done);
	});
}

/**
 * For a build older than the server accepts: saves the position and reloads
 * into the newest build without asking, from any screen.
 */
export async function forceUpdate(): Promise<void> {
	if (reloadRequested) return;
	const reg = registration;
	const waiting = reg ? (reg.waiting ?? (await waitForInstalled(reg))) : null;
	// After the install wait, so reading during it is part of the flush.
	await flushPendingSaves();
	activateWaiting(waiting);
}

export function resetAppUpdateForTests() {
	registration = null;
	container = null;
	reloadRequested = false;
	lastCheck = 0;
	appUpdateReady.set(false);
}
