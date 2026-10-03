import { ENGINE_UNSUPPORTED_CLASS, engineCheckScript } from "@lesefluss/core/engine-support";

/** For a route's `head().scripts`: runs before the page's CSS and JS can fail. */
export const oldBrowserCheckScript = { children: engineCheckScript({ platform: "web" }) };

/**
 * Server-rendered and hidden until the head check marks the browser as too old.
 * Styled inline: Chromium 99-110 still applies the site's layered reset.
 */
export function OldBrowserNotice() {
	return (
		<>
			<style>{`#old-browser-notice{display:none}html.${ENGINE_UNSUPPORTED_CLASS} #old-browser-notice{display:block}`}</style>
			<div
				id="old-browser-notice"
				role="alert"
				style={{
					margin: "16px auto",
					maxWidth: "34em",
					padding: "16px",
					border: "2px solid #000",
					background: "#fff",
					color: "#000",
					fontFamily: "sans-serif",
					fontSize: "17px",
					lineHeight: 1.5,
				}}
			>
				<p style={{ margin: "0 0 8px", fontWeight: "bold" }}>
					This browser is too old to sign in here.
				</p>
				<p style={{ margin: 0 }}>
					Use a current version of Chrome, Firefox or Safari. Or sign in from the Lesefluss app: in
					Settings, choose "Sign in with your phone" and scan the code, or sign in with email and
					password.
				</p>
			</div>
		</>
	);
}
