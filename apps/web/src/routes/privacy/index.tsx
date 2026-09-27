import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "~/components/legal-page";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/privacy/")({
	component: PrivacyPage,
	head: () =>
		seo({
			title: "Privacy - Lesefluss",
			description: "What data Lesefluss collects, how it's used, and how to delete it.",
			path: "/privacy",
		}),
});

function PrivacyPage() {
	return (
		<LegalPage title="Privacy" subtitle="Last updated: September 2026">
			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">TL;DR</h2>
				<p>
					Lesefluss is designed to collect as little as possible. The Android app works fully
					offline - no account needed. This website uses cookieless analytics and sets no tracking
					cookies. The only cookie you may receive is a login session cookie, and only if you sign
					in to use cloud sync.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">What this site collects</h2>
				<h3 className="mt-4 mb-2 font-medium text-foreground">Analytics (anonymous)</h3>
				<p>
					Pageviews are logged with a self-hosted{" "}
					<a
						href="https://umami.is"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Umami
					</a>{" "}
					instance running on our own server. No cookies are set, no personal data is stored, and
					data never leaves our infrastructure. Recorded fields: page URL, referrer, browser, OS,
					device type, country (derived from IP - the IP itself is never saved).
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">Session cookies</h3>
				<p>
					If you sign in (cloud sync), a session cookie is set by{" "}
					<a
						href="https://better-auth.com"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Better Auth
					</a>{" "}
					to keep you logged in. This cookie is strictly necessary to deliver the service you
					requested (authenticated access) and does not require consent under the ePrivacy Directive
					/ GDPR. It contains no tracking identifiers and is not shared with third parties.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">Server logs</h3>
				<p>
					Our host may keep short-lived request logs (IP, timestamp, path) for security and abuse
					prevention. These are not correlated with accounts and are rotated out quickly.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">Error diagnostics</h3>
				<p>
					If error reporting is enabled, browser and server errors are sent to a self-hosted
					GlitchTip instance on our own infrastructure. Reports contain technical diagnostics such
					as the error message, stack trace, app version, browser, operating system, and affected
					page. We do not enable session replay, performance tracing, profiling, tracking cookies,
					or default collection of personal data.
				</p>
				<p className="mt-4">
					The Android app sends anonymized diagnostics to our own server to help us find bugs that
					would otherwise be invisible (for example, a reading position that silently fails to
					save). These reports contain no account or personal data: an error type and message, the
					app version, platform, a coarse OS version, and a random session id that is regenerated
					every time the app starts. They are never linked to an identity or used for tracking. You
					can turn this off any time under Settings &rarr; Privacy in the app.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">
					What we store when you sign in
				</h2>
				<p>Cloud sync is opt-in. When you create an account, we store:</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Account</strong>: your email, a hashed password
							(or OAuth provider ID), and a display name.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Books</strong>: title, author, plain-text content,
							cover image, chapter list, word count, and your reading position - everything the app
							needs to restore your library on a new device.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Settings</strong>: RSVP and reader preferences
							(speed, theme, font, margins, etc.).
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Highlights</strong>: the text ranges you
							highlight, their color, and optional notes.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					Your data is stored on a server in the EU and is never sold, shared, or used to train
					models. Only you can read it.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Social profile</h2>
				<p>
					Social features are optional and only start once you pick a handle. Until then nothing
					about you is visible to other users. We process this data to provide the feature you opted
					into (Art. 6(1)(b) GDPR, performance of a contract).
				</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Identity card</strong>: your handle, display name
							and avatar. This is shown to any user you legitimately interact with: friend requests,
							friend lists, invite pages and shared reading. It is shown regardless of your profile
							visibility setting, so a private profile is not an invisible one. Handles are not
							searchable and there is no public directory.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Profile visibility</strong>: either private (the
							default: your bio and profile sections are visible only to you) or friends (accepted
							friends see your bio and the sections you leave on: currently reading, finished books,
							reading stats and shared highlights). There is no public setting; profiles are shown
							only inside the app and only to friends.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Avatar</strong>: an image you upload, or your
							Google or Discord account picture if you explicitly choose it. Either way we resize it
							to 256 pixels, re-encode it and drop all embedded metadata (including EXIF and GPS
							data) before storing it. Choosing the account picture copies it once; we never link to
							the provider's image. You can replace or remove the avatar at any time.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Released handles</strong>: when you change your
							handle, the old handle string is held for 90 days so nobody else can take it over in
							the meantime; the hold remembers that it was yours so that only you can reclaim it,
							and it is never shown to anyone. Deleting your account keeps the hold but removes the
							link to you. After 90 days the handle is free for anyone.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					Your social profile, avatar and settings are deleted with your account. Clearing your
					cloud data keeps them.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Friends and invite links</h2>
				<p>
					Nobody can look you up. Other users reach you only through a personal invite link you hand
					out yourself, or by sending a request while you read a book together. To run this we
					store:
				</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Friendships</strong>: which two accounts are
							friends and since when. Friends see each other in their friend lists.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Friend requests</strong>: who asked whom and when,
							and whether it is still open. A declined request is kept for 90 days so that the same
							person cannot keep asking; requests that were never answered are dropped 30 days after
							they were sent. The sender is never told that a request was declined.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Blocks</strong>: whom you have blocked. Only you
							can see your block list; a blocked person is not told.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Invite links</strong>: your current link and when
							it expires (14 days). Anyone who opens it sees your handle, display name and avatar,
							whatever your profile visibility, so only share it with people you want as friends.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					All of it is deleted with your account, including the rows in which you are the other
					party. Clearing your cloud data keeps it.
				</p>
				<h3 className="mt-6 mb-2 font-medium text-foreground">Inbox</h3>
				<p>
					The app's inbox is backed by social notifications we store for you: what happened (for
					example a friend request or an accepted request), who did it, when, and whether you have
					read it. Nothing is stored about declines, removed friends or blocks. Items you have read
					are deleted 90 days after you read them, and every item is deleted 365 days after it was
					created, or earlier when either account is deleted or one of you blocks the other.
				</p>
				<h3 className="mt-6 mb-2 font-medium text-foreground">What friends see on your profile</h3>
				<p>
					With profile visibility set to <em>private</em> (the default), a friend sees only your
					identity card and since when you are friends. With <em>friends</em>, they also see your
					bio, how many friends you have, and each section you leave switched on: the books you are
					currently reading (title, author, progress), the books you finished (title, author, finish
					date, your star rating) and your reading stats (books finished this year, words read,
					reading time and reading speed as totals). Never shown: your review text, notes, tags,
					exact reading position, individual reading sessions, articles you imported from the web,
					or your email. Any book can be hidden from your profile in its edit sheet; a hidden book
					leaves every section and the stats. Nobody outside your friends can open your profile.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Sharing books</h2>
				<p>
					You can offer a synced book to one friend at a time. If they accept, the server copies the
					book into their account: the text, cover, chapters, links, title, author, description,
					language and where it came from. Not copied: your reading position, status, rating, notes,
					tags, highlights, glossary, reading sessions or the hide-from-profile flag. The copy then
					belongs to your friend and stays in their library even if you unfriend each other, block
					each other or delete your account. Only a takedown following a notice removes it.
				</p>
				<p className="mt-4">
					For every share we store who offered which book to whom, when, and the outcome (open,
					accepted, declined, expired or withdrawn), plus the title, author and length as they were
					when you shared. Open offers expire after 30 days; closed records are deleted 90 days
					after they closed. Your one-time confirmation that you may share, with its timestamp, is
					stored with your account. Every book carries an internal origin marker so that two copies
					of the same book can be recognised for reading together and so that a takedown can reach
					every copy; the app only ever receives a scrambled form of it, never who uploaded the
					book. All of this is deleted with your account, except copies that friends accepted.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Buddy reads</h2>
				<p>
					A buddy read is a group of up to eight people reading the same book. For each one we
					store the book's title and author, who hosts it, an optional target date, who is a member
					with which of their books, when they joined, left or finished, and every invite (who
					invited whom, when, and the outcome). Only friends can be invited, and an invite tells the
					invitee who else is in before they join.
				</p>
				<p className="mt-4">
					While you are a member, everyone else in the buddy read sees your handle, display name and
					avatar, how far you are in the book (percentage, chapter and position), whether you
					finished it and when you last read, even if you are not friends with them. We take this
					from your last synced reading position; no extra data is collected. Someone you blocked
					or who blocked you sees none of it. Members can send each other friend requests. When
					you leave, are removed, or your copy of the book is deleted, the others stop seeing your
					progress; the book stays in your library. A buddy read is deleted when its last member
					leaves, and your memberships and invites are deleted with your account. A joiner who does
					not have the book receives a copy exactly as with sharing.
				</p>
				<h3 className="mt-6 mb-2 font-medium text-foreground">Comments and shared highlights</h3>
				<p>
					In a buddy read you can write comments, reply to them, react with an emoji and share
					highlights. We store the text, where in the book it belongs, who wrote it and when, and
					who reacted. A shared highlight includes its note. Nothing is shared unless you share it,
					either one highlight at a time or with the "share all my highlights" setting, which you
					can switch off again. Only current members of the buddy read see these items, each only
					once they have read that far, and never someone you blocked or who blocked you. To decide
					what to show, we keep the furthest position you have reached in the book. If you leave,
					your comments stay and your shared highlights disappear. Everything is deleted with the
					buddy read. When you delete your account, your reactions and shared highlights are
					deleted and your comments are deleted too, except that a comment others replied to stays
					as an empty "removed" entry without your name.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Notices and moderation</h2>
				<p>
					Anyone can report a profile or a shared book, in the app or through the public report
					form. For each notice we store: what was reported and where, the reason and explanation,
					who notified us (your account, or the name and email you typed into the form), a text
					snapshot of the reported item as it looked at that moment (for a profile the handle,
					display name and bio; for a book the sender, title, author and origin, never the book
					text), our decision, who made it and when, and whether the emails about it were delivered.
					The snapshot exists because the reported item can be edited or deleted before we review
					it.
				</p>
				<p className="mt-4">
					The reported user is never told who notified us. If we restrict an account we email the
					affected user a statement of reasons and place it in their inbox; the notifier receives
					our decision by email or in their inbox. Notices are deleted 24 months after the decision.
					When an account is deleted, its restrictions end and its name and email are removed from
					the notices it submitted. The notices themselves stay until their 24 months are over,
					because we must be able to show that we acted on them. Removal records (which book was
					taken down from which account) are kept for good: they are what keeps a removed book from
					being uploaded again.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">The Android app</h2>
				<p>
					The app runs fully offline by default. Books, settings, and highlights live in a local
					SQLite database on your device. Apart from the anonymized error diagnostics described
					above (which you can turn off under Settings &rarr; Privacy), nothing leaves the device
					unless you explicitly sign in to sync. Bluetooth is used only to talk to the optional
					ESP32 device and transmits nothing to us.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Browser extension</h2>
				<p>
					The Chrome/Firefox extension is optional and only works after you sign in. It stores your
					Lesefluss session token and account email in browser extension storage so it can import
					articles into your cloud library without asking you to sign in every time.
				</p>
				<p className="mt-4">
					When you click <strong className="text-foreground">Save this page</strong> or use the
					selection context menu, the extension reads the current page URL, page title, and the
					readable article HTML or selected HTML. That content is sent to Lesefluss only for the
					page or selection you explicitly save, converted to plain text, and stored as a book in
					your synced library. The extension also checks the active tab URL against your library to
					show whether the page was already saved.
				</p>
				<p className="mt-4">
					The extension does not run analytics, does not collect browsing history, does not capture
					pages automatically, and does not sell or share extension data. You can remove imported
					articles or delete your account from Lesefluss to delete synced extension imports.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Third parties</h2>
				<ul className="space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Google Sign-In</strong> - see the dedicated{" "}
							<em>Google user data</em> section below for a full disclosure of what we receive from
							Google, how we use it, and how it is stored.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Discord Sign-In</strong> - if you choose to sign
							in with Discord, Discord processes the request under its own privacy policy and shares
							your email address and username with us to create your account. We do not request any
							other scopes and never act on your behalf with Discord services.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Resend</strong> - account emails (verification,
							password reset) are delivered via{" "}
							<a
								href="https://resend.com"
								target="_blank"
								rel="noopener noreferrer"
								className="text-foreground underline decoration-border hover:decoration-foreground/50"
							>
								Resend
							</a>
							, acting as a data processor on our behalf. Only your email address is shared, and
							only when we send you one of these messages.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">GitHub</strong> - if you download the APK or view
							the source, GitHub processes the request under its own privacy policy.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<strong className="text-foreground">Dictionary lookups</strong> - in-app word lookups
							query our own catalog service, not a third party. Only the word and the book's
							language are sent; no account or identifier.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					There are no advertising networks, no social-media pixels, no third-party analytics.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Google user data</h2>
				<p>
					This section describes how Lesefluss accesses, uses, stores, and shares Google user data,
					in accordance with the{" "}
					<a
						href="https://developers.google.com/terms/api-services-user-data-policy"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Google API Services User Data Policy
					</a>
					, including the Limited Use requirements.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">What we access</h3>
				<p>
					When you choose to sign in with Google, we use Google's standard OAuth 2.0 sign-in flow
					with only the following default scopes:
				</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<code className="text-foreground">openid</code> - your Google account identifier (
							<code className="text-foreground">sub</code>) so we can recognise returning users.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<code className="text-foreground">email</code> - your Google account email address and
							whether it is verified.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							<code className="text-foreground">profile</code> - your display name and profile
							picture URL.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					We do not request any other Google OAuth scopes. Lesefluss never accesses Gmail, Google
					Drive, Contacts, Calendar, Photos, YouTube, or any other Google service on your behalf,
					and never reads, writes, or modifies any data in your Google account.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">How we use it</h3>
				<p>The data received from Google is used exclusively to:</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							Create your Lesefluss account on first sign-in and link subsequent sign-ins to the
							same account.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							Authenticate you and maintain your signed-in session so cloud sync (books, settings,
							highlights) works across devices.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">-</span>
						<span>
							Display your name or email in the app UI (e.g. on your profile page) and send you
							transactional account emails such as email verification and password reset.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					Google user data is never used for advertising, never sold, never shared with third
					parties for their own purposes, and never used to train AI or machine-learning models.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">How we store it</h3>
				<p>
					Your Google account identifier, email, name, and profile picture URL are stored in our
					authentication database (PostgreSQL, hosted in the EU) alongside your Lesefluss account.
					Access is restricted to the Lesefluss backend and the project maintainer. We do not store
					Google OAuth refresh tokens beyond what Better Auth needs to keep your session valid, and
					we do not request offline access.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">How we share it</h3>
				<p>
					We do not share Google user data with any third party. The only processors involved are:
					our EU database host (storage), and{" "}
					<a
						href="https://resend.com"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Resend
					</a>{" "}
					(transactional email delivery - only your email address, only when sending you an account
					email). Both act solely on our behalf under data processing terms.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">Retention and deletion</h3>
				<p>
					Google user data is retained for as long as your Lesefluss account exists. You can delete
					your account at any time from within the app; doing so permanently erases your account
					record (including the Google-provided identifier, email, name, and picture URL) as well as
					any synced books, settings, and highlights. You can additionally revoke Lesefluss's access
					from your{" "}
					<a
						href="https://myaccount.google.com/permissions"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Google Account permissions page
					</a>
					.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Your rights</h2>
				<p>
					Under GDPR you can request access to, correction of, or deletion of your personal data.
					For account data, you can delete your account from within the app to purge everything we
					have on you. For any other request, email{" "}
					<a
						href="mailto:privacy@lesefluss.app"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						privacy@lesefluss.app
					</a>
					.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Changes</h2>
				<p>
					If we change what the site or app collects, we'll update this page and note it at the top.
					For significant changes affecting existing users, we'll notify you in-app.
				</p>
			</section>
		</LegalPage>
	);
}
