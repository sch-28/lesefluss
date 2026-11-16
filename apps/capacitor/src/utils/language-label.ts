const languageNames = (() => {
	try {
		return new Intl.DisplayNames(["en"], { type: "language" });
	} catch {
		return null;
	}
})();

export function languageLabel(code: string): string {
	if (code === "all") return "All languages";
	try {
		return languageNames?.of(code) ?? code.toUpperCase();
	} catch {
		return code.toUpperCase();
	}
}

// ISO 639-1. Names come from Intl, so the list itself stays codes only.
const ISO_639_1 =
	"aa ab af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(
		" ",
	);

export type LanguageOption = { code: string; name: string; native: string };

function nativeName(code: string): string {
	try {
		return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
	} catch {
		return code;
	}
}

let options: LanguageOption[] | null = null;

export function languageOptions(): LanguageOption[] {
	options ??= ISO_639_1.map((code) => ({
		code,
		name: languageLabel(code),
		native: nativeName(code),
	})).sort((a, b) => a.name.localeCompare(b.name));
	return options;
}

export function languageOption(code: string): LanguageOption {
	return (
		languageOptions().find((o) => o.code === code) ?? {
			code,
			name: languageLabel(code),
			native: nativeName(code),
		}
	);
}

/** By code, English name or native name; "deu" and "deutsch" both find de. */
export function searchLanguages(query: string): LanguageOption[] {
	const q = query.trim().toLowerCase();
	if (!q) return languageOptions();
	return languageOptions().filter(
		(o) =>
			o.code.startsWith(q) ||
			o.name.toLowerCase().includes(q) ||
			o.native.toLowerCase().includes(q),
	);
}
