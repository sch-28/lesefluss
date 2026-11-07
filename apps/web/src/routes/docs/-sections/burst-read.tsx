import { PictureInPicture2 } from "lucide-react";
import type { DocsSection } from "./shared";

const codeClass = "rounded bg-muted px-1 py-0.5 font-mono text-foreground text-xs";
const blockClass =
	"overflow-x-auto rounded-md bg-muted p-3 font-mono text-foreground text-xs leading-relaxed";

function Content() {
	return (
		<div className="space-y-4 text-muted-foreground leading-relaxed">
			<p>
				Burst read is a slim strip that sits on top of your other windows on a desktop computer. It
				continues the book you read last right where you left off, plays RSVP as soon as you look at
				it, and pauses and saves your place the moment you look away. Short bursts between other
				work add up.
			</p>

			<h4 className="font-semibold text-foreground">Opening it</h4>
			<ul className="list-inside list-disc space-y-2 text-sm">
				<li>
					Press <code className={codeClass}>Ctrl K</code> (<code className={codeClass}>⌘ K</code> on
					a Mac) anywhere in the web app and run{" "}
					<strong className="text-foreground">Burst read</strong>.
				</li>
				<li>
					Or, while reading, open the <strong className="text-foreground">⋯</strong> menu and pick{" "}
					<strong className="text-foreground">Burst read</strong>.
				</li>
			</ul>
			<p className="text-sm">
				In Chrome and Edge it opens as its own small always-on-top window. Firefox and Safari can't
				do that yet, so there the strip floats inside the Lesefluss tab instead; drag it by its
				grip, and after a burst it shrinks to a small pill you click for the next one.
			</p>

			<h4 className="font-semibold text-foreground">Using it</h4>
			<ul className="list-inside list-disc space-y-2 text-sm">
				<li>
					<code className={codeClass}>Space</code> pauses and plays,{" "}
					<code className={codeClass}>←</code> <code className={codeClass}>→</code> step a word,{" "}
					<code className={codeClass}>↑</code> <code className={codeClass}>↓</code> change the
					speed.
				</li>
				<li>
					The <strong className="text-foreground">Text</strong> switch shows the words around your
					place instead; it never plays by itself, and <code className={codeClass}>↑</code>{" "}
					<code className={codeClass}>↓</code> move a line.
				</li>
				<li>
					Clicking another window pauses, saves, and shows for a second how many words you read and
					how far along today's goal is.
				</li>
			</ul>

			<h4 className="font-semibold text-foreground">One key for it on a tiling desktop</h4>
			<p className="text-sm">
				The window is titled <code className={codeClass}>Lesefluss burst read</code>, so a window
				rule can find it. On Hyprland, park it in a special workspace and toggle that with a key:
			</p>
			<pre className={blockClass}>
				{`windowrule = workspace special:burst silent, title:^(Lesefluss burst read)$
windowrule = float, title:^(Lesefluss burst read)$
windowrule = size 600 120, title:^(Lesefluss burst read)$
bind = SUPER, B, togglespecialworkspace, burst`}
			</pre>
			<p className="text-sm">
				Super B now shows the strip and it starts playing; Super B again hides it and it saves. If
				the rule doesn't catch the window, check its title with{" "}
				<code className={codeClass}>hyprctl clients</code>. Sway and i3 work the same way with a{" "}
				<code className={codeClass}>for_window [title="Lesefluss burst read"] move scratchpad</code>{" "}
				rule and{" "}
				<code className={codeClass}>
					bindsym $mod+b [title="Lesefluss burst read"] scratchpad show
				</code>
				.
			</p>

			<h4 className="font-semibold text-foreground">On a regular desktop</h4>
			<p className="text-sm">
				The window already stays on top, so put it at the edge of the screen and click it when you
				want a burst. To reach it from the keyboard, <code className={codeClass}>Alt Tab</code> to
				it (<code className={codeClass}>⌘ `</code> among the browser's windows on a Mac). On KDE
				Plasma you can give it its own key: right-click its title bar, choose{" "}
				<strong className="text-foreground">
					More Actions → Configure Special Window Settings
				</strong>
				, and add a <strong className="text-foreground">Shortcut</strong> rule.
			</p>
		</div>
	);
}

export const burstReadSection: DocsSection = {
	id: "burst-read",
	title: "Burst Read",
	icon: PictureInPicture2,
	Content,
};
