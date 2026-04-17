import * as React from "react";

export interface SiteFlags {
	hideGithub: boolean;
}

export const SiteFlagsContext = React.createContext<SiteFlags>({ hideGithub: false });

export function useSiteFlags(): SiteFlags {
	return React.useContext(SiteFlagsContext);
}
