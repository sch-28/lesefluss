import { describe, expect, it } from "vitest";
import { languageOption, searchLanguages } from "../language-label";

const codes = (query: string) => searchLanguages(query).map((o) => o.code);

describe("searchLanguages", () => {
	it("finds a language by its code, English name or native name", () => {
		expect(codes("de")).toContain("de");
		expect(codes("german")).toContain("de");
		expect(codes("deu")).toContain("de");
		expect(codes("Français")).toContain("fr");
	});

	it("lists every language for an empty query", () => {
		expect(searchLanguages("").length).toBeGreaterThan(150);
	});
});

describe("languageOption", () => {
	it("names a tag outside the list instead of dropping it", () => {
		expect(languageOption("de")).toMatchObject({ name: "German", native: "Deutsch" });
		expect(languageOption("pt-BR").code).toBe("pt-BR");
	});
});
