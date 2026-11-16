import { PictureInPicture } from "lucide-react";
import type { DocsSection } from "./shared";

const codeClass = "rounded bg-muted px-1 py-0.5 font-mono text-foreground text-xs";
const blockClass =
	"overflow-x-auto rounded-md bg-muted p-3 font-mono text-foreground text-xs leading-relaxed";

function Content() {
	return (
		<div className="space-y-4 text-muted-foreground leading-relaxed">
			<p>
				Quick RSVP is a small window that plays the book you have open, one word at a time, next to
				your other work. It starts at the word you are on, and the reader tab follows along, so you
				can switch between the two at any point without losing your place. It is for the web app on
				a desktop computer; on a phone and in the Android app it is not offered.
			</p>

			<h4 className="font-semibold text-foreground">Opening it</h4>
			<ul className="list-inside list-disc space-y-2 text-sm">
				<li>
					While reading, open the <strong className="text-foreground">⋮</strong> menu and pick{" "}
					<strong className="text-foreground">Quick RSVP</strong>.
				</li>
				<li>
					Or press <code className={codeClass}>Ctrl K</code> (<code className={codeClass}>⌘ K</code>{" "}
					on a Mac) in the reader and run <strong className="text-foreground">Quick RSVP</strong>.
				</li>
			</ul>
			<p className="text-sm">
				In Chrome and Edge it opens as a small window that stays on top of your other windows.
				Firefox and Safari can't do that yet, so there it opens as a normal popup window; if nothing
				opens, allow pop-ups for this site.
			</p>

			<h4 className="font-semibold text-foreground">Using it</h4>
			<ul className="list-inside list-disc space-y-2 text-sm">
				<li>
					<code className={codeClass}>Space</code> or a click on the word pauses and plays,{" "}
					<code className={codeClass}>←</code> <code className={codeClass}>→</code> step a word,{" "}
					<code className={codeClass}>↑</code> <code className={codeClass}>↓</code> change the
					speed. The speed control at the bottom does the same.
				</li>
				<li>
					The reader tab shows <strong className="text-foreground">Playing in Quick RSVP</strong>{" "}
					and moves along with it. Your place is saved as you read.
				</li>
				<li>
					Scroll or turn a page in the reader tab and Quick RSVP pauses there; play it again to go
					on from that word. <strong className="text-foreground">Bring back here</strong> closes the
					window and you read on in the tab.
				</li>
				<li>Close the book or the tab and Quick RSVP stops at its last word, which stays saved.</li>
			</ul>

			<h4 className="font-semibold text-foreground">One key for it on a tiling desktop</h4>
			<p className="text-sm">
				In Chrome and Edge the window is titled{" "}
				<code className={codeClass}>Lesefluss Quick RSVP</code>, so a window rule can find it. On
				Hyprland, park it in a special workspace and toggle that with a key:
			</p>
			<pre className={blockClass}>
				{`windowrule = workspace special:rsvp silent, title:^(Lesefluss Quick RSVP)$
windowrule = float, title:^(Lesefluss Quick RSVP)$
windowrule = size 380 150, title:^(Lesefluss Quick RSVP)$
bind = SUPER, B, togglespecialworkspace, rsvp`}
			</pre>
			<p className="text-sm">
				Super B now shows the window and Super B again hides it. Hiding it pauses the reading; press{" "}
				<code className={codeClass}>Space</code> to go on. If the rule doesn't catch the window,
				check its title with <code className={codeClass}>hyprctl clients</code>. Sway and i3 work
				the same way with a{" "}
				<code className={codeClass}>for_window [title="Lesefluss Quick RSVP"] move scratchpad</code>{" "}
				rule and{" "}
				<code className={codeClass}>
					bindsym $mod+b [title="Lesefluss Quick RSVP"] scratchpad show
				</code>
				. The Firefox and Safari popup is titled <code className={codeClass}>Quick RSVP · </code>{" "}
				and the book's title.
			</p>

			<h4 className="font-semibold text-foreground">On a regular desktop</h4>
			<p className="text-sm">
				In Chrome and Edge the window already stays on top, so put it at the edge of the screen. To
				reach it from the keyboard, <code className={codeClass}>Alt Tab</code> to it (
				<code className={codeClass}>⌘ `</code> among the browser's windows on a Mac). On KDE Plasma
				you can give it its own key: right-click its title bar, choose{" "}
				<strong className="text-foreground">
					More Actions → Configure Special Window Settings
				</strong>
				, and add a <strong className="text-foreground">Shortcut</strong> rule.
			</p>
		</div>
	);
}

export const quickRsvpSection: DocsSection = {
	id: "quick-rsvp",
	title: "Quick RSVP",
	icon: PictureInPicture,
	Content,
};
