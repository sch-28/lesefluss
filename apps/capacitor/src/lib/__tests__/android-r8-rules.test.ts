import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(resolve(__dirname, "../../../android/app/proguard-rules.pro"), "utf8");

const keptAnnotationTypes = [...rules.matchAll(/^-keep @interface (\S+)/gm)].map((m) => m[1]);

function isKept(annotation: string): boolean {
	return keptAnnotationTypes.some((pattern) =>
		pattern.endsWith(".*")
			? annotation.startsWith(pattern.slice(0, -1)) &&
				!annotation.slice(pattern.length - 1).includes(".")
			: pattern === annotation,
	);
}

describe("Android release R8 rules", () => {
	// The Capacitor bridge reads these by reflection at runtime; an unkept one folds to null under R8 full mode.
	it.each([
		"com.getcapacitor.annotation.CapacitorPlugin",
		"com.getcapacitor.annotation.Permission",
		"com.getcapacitor.annotation.PermissionCallback",
		"com.getcapacitor.annotation.ActivityCallback",
		"com.getcapacitor.PluginMethod",
		"com.getcapacitor.NativePlugin",
	])("keeps the %s annotation type", (annotation) => {
		expect(isKept(annotation)).toBe(true);
	});
});
