import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { changelog } from "@lesefluss/core";
import { useQuery } from "@tanstack/react-query";

/** The newest release note's date: the web app ships continuously and has no version number. */
const WEB_UPDATED = changelog.reduce((newest, e) => (e.date > newest ? e.date : newest), "");

export function appVersionLabel(nativeVersion: string | null | undefined): string | null {
	if (Capacitor.isNativePlatform()) return nativeVersion ? `Version ${nativeVersion}` : null;
	return WEB_UPDATED ? `Web app, updated ${WEB_UPDATED}` : null;
}

/** The installed version, so a bug report or a What's new entry can be matched to it. */
export function AppVersionLine() {
	const { data } = useQuery({
		queryKey: ["app-version"],
		queryFn: () => App.getInfo().then((info) => info.version),
		enabled: Capacitor.isNativePlatform(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const label = appVersionLabel(data);
	return (
		<p className="m-0 min-h-10 px-4 py-3 text-muted-foreground text-xs" data-testid="app-version">
			{label}
		</p>
	);
}
