import { Link, useRouter } from "@tanstack/react-router";
import { Cpu, FileText, History, LogIn, LogOut, Menu, Smartphone, User, X } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { signOut, useSession } from "~/lib/auth-client";
import { useSiteFlags } from "~/lib/site-flags";

const NAV_LINKS = [
	{ to: "/device" as const, label: "Device", icon: Cpu },
	{ to: "/docs" as const, label: "Docs", icon: FileText },
	{ to: "/changelog" as const, label: "Changelog", icon: History },
];

const navLinkClass = (mobile: boolean) =>
	mobile
		? "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

const navLinkActiveClass = "text-foreground bg-muted";

/** GitHub mark SVG - lucide-react 1.x removed brand icons */
function GithubIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
		</svg>
	);
}

function getInitials(name?: string | null, email?: string | null): string {
	if (name?.trim()) return name.trim()[0].toUpperCase();
	if (email?.trim()) return email.trim()[0].toUpperCase();
	return "U";
}

type SessionUser = NonNullable<ReturnType<typeof useSession>["data"]>["user"];

function UserMenu({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-8 rounded-full bg-muted font-semibold text-foreground text-sm"
					aria-label="Account menu"
				>
					{getInitials(user.name, user.email)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col gap-0.5">
						{user.name && <span className="font-medium text-foreground text-sm">{user.name}</span>}
						<span className="truncate text-muted-foreground text-xs">{user.email}</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/profile">
						<User className="size-4" />
						Profile
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a href="/app">
						<Smartphone className="size-4" />
						Open App
					</a>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onSelect={onSignOut}>
					<LogOut />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function Header() {
	const [mobileOpen, setMobileOpen] = React.useState(false);
	const { data: session, isPending } = useSession();
	const user = session?.user;
	const router = useRouter();
	const { hideGithub } = useSiteFlags();

	// Close mobile menu on navigation (back button, programmatic, etc.)
	React.useEffect(() => {
		return router.subscribe("onLoad", () => setMobileOpen(false));
	}, [router]);

	// Close mobile menu when resized to desktop breakpoint
	React.useEffect(() => {
		const mq = window.matchMedia("(min-width: 768px)");
		const handler = (e: MediaQueryListEvent) => {
			if (e.matches) setMobileOpen(false);
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	const handleSignOut = () => {
		signOut().catch(console.error);
	};

	return (
		<header className="sticky top-0 z-50 bg-background/95 shadow-sm backdrop-blur-md">
			<a
				href="#main"
				className="sr-only absolute top-4 left-4 z-50 rounded bg-background px-4 py-2 font-medium text-foreground focus:not-sr-only"
			>
				Skip to content
			</a>
			<div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
				{/* Logo */}
				<Link
					to="/"
					className="flex items-center gap-2 font-semibold text-foreground text-lg tracking-tight"
				>
					<img src="/logo.png" alt="" className="size-7 rounded-md" />
					Lesefluss
				</Link>

				{/* Desktop nav + auth - all right-aligned */}
				<div className="hidden items-center gap-1 md:flex">
					<nav className="flex items-center gap-1">
						{NAV_LINKS.map(({ to, label }) => (
							<Link
								key={to}
								to={to}
								activeProps={{ className: navLinkActiveClass }}
								className={navLinkClass(false)}
							>
								{label}
							</Link>
						))}
						{!hideGithub && (
							<a
								href="https://github.com/sch-28/lesefluss"
								target="_blank"
								rel="noopener noreferrer"
								className={navLinkClass(false)}
							>
								<GithubIcon className="size-3.5" />
								GitHub
							</a>
						)}
					</nav>

					<div className="mx-2 h-4 w-px bg-border" />

					{!isPending &&
						(user ? (
							<UserMenu user={user} onSignOut={handleSignOut} />
						) : (
							<Button asChild size="sm">
								<Link to="/login">
									<LogIn className="size-3.5" />
									Login
								</Link>
							</Button>
						))}
				</div>

				{/* Mobile: auth avatar + hamburger */}
				<div className="flex items-center gap-2 md:hidden">
					{!isPending && user && <UserMenu user={user} onSignOut={handleSignOut} />}
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setMobileOpen((o) => !o)}
						aria-label="Toggle menu"
					>
						{mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
					</Button>
				</div>
			</div>
			{/* Gradient accent line */}
			<div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

			{/* Mobile nav panel */}
			{mobileOpen && (
				<div className="border-border border-t bg-background/95 px-6 pt-2 pb-4 md:hidden">
					<nav className="flex flex-col gap-1">
						{NAV_LINKS.map(({ to, label, icon: Icon }) => (
							<Link
								key={to}
								to={to}
								activeProps={{ className: navLinkActiveClass }}
								className={navLinkClass(true)}
							>
								<Icon className="size-4" />
								{label}
							</Link>
						))}
						{!hideGithub && (
							<a
								href="https://github.com/sch-28/lesefluss"
								target="_blank"
								rel="noopener noreferrer"
								className={navLinkClass(true)}
							>
								<GithubIcon className="size-4" />
								GitHub
							</a>
						)}
						{user && (
							<Link to="/profile" className={navLinkClass(true)}>
								<User className="size-4" />
								Profile
							</Link>
						)}
						{user && (
							<a href="/app" className={navLinkClass(true)}>
								<Smartphone className="size-4" />
								Open App
							</a>
						)}
						{!user && (
							<Link to="/login" className={navLinkClass(true)}>
								<LogIn className="size-4" />
								Login
							</Link>
						)}
					</nav>
				</div>
			)}
		</header>
	);
}
