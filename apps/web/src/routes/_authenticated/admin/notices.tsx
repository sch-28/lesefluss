import {
	NOTICE_REASON_LABELS,
	NOTICE_REASONS,
	NOTICE_TARGET_TYPES,
	type NoticeReason,
	type NoticeTargetType,
} from "@lesefluss/core";
import { Badge } from "@lesefluss/ui/badge";
import { Button } from "@lesefluss/ui/button";
import { Separator } from "@lesefluss/ui/separator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import * as React from "react";
import type { NoticeStatus } from "~/db/schema";
import {
	type AdminNotice,
	decideAdminNotice,
	getAdminRestrictions,
	getNoticeContext,
	getNotices,
	liftAdminRestriction,
	resendAdminNoticeMail,
	unbanAdminUser,
} from "~/lib/admin-notices";
import type { SuspensionDuration } from "~/lib/moderation/restrictions";
import type { TakedownScope } from "~/lib/moderation/takedown";
import type { NoticeActionKind } from "~/lib/moderation/targets";
import { NOTICE_TARGET_LABELS } from "~/lib/moderation/web-form";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/_authenticated/admin/notices")({
	loader: async ({ context }) => {
		if (context.session.user.role !== "admin") throw redirect({ to: "/" });
	},
	head: () => seo({ title: "Notices - Admin - Lesefluss", isNoindex: true }),
	component: NoticesPage,
});

const ACTION_LABELS: Record<NoticeActionKind, string> = {
	reject: "Reject notice",
	remove_bio: "Remove bio",
	remove_avatar: "Remove avatar",
	reset_handle: "Reset handle",
	take_down_book: "Take down book",
	suspend_sharing: "Suspend sharing",
	ban: "Ban user",
	remove_comment: "Remove comment",
	remove_highlight_share: "Remove shared highlight",
};

const STATUS_LABELS: Record<NoticeStatus, string> = {
	open: "Open",
	actioned: "Actioned",
	rejected: "Rejected",
};

const keys = {
	notices: (filter: Filter) => ["admin", "notices", filter] as const,
	context: (id: string) => ["admin", "notice", id] as const,
	restrictions: ["admin", "restrictions"] as const,
};

type Filter = { status?: NoticeStatus; targetType?: NoticeTargetType; reason?: NoticeReason };

function age(ms: number): string {
	const hours = Math.floor((Date.now() - ms) / 3_600_000);
	if (hours < 1) return "just now";
	if (hours < 48) return `${hours} h`;
	return `${Math.floor(hours / 24)} d`;
}

function formatDate(ms: number | null): string {
	return ms === null ? "—" : new Date(ms).toLocaleString("en-GB");
}

function Select<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T | "";
	options: { value: T; label: string }[];
	onChange: (value: T | "") => void;
}) {
	return (
		<label className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground text-xs">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as T | "")}
				className="rounded-md border border-border bg-background px-2 py-1 text-sm"
			>
				<option value="">All</option>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

function NoticeDetail({ notice, onDone }: { notice: AdminNotice; onDone: () => void }) {
	const queryClient = useQueryClient();
	const context = useQuery({
		queryKey: keys.context(notice.id),
		queryFn: () => getNoticeContext({ data: { id: notice.id } }),
	});
	const [action, setAction] = React.useState<NoticeActionKind>("reject");
	const [duration, setDuration] = React.useState<SuspensionDuration>("7d");
	const [scope, setScope] = React.useState<TakedownScope>("copy");
	const [note, setNote] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);
	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: ["admin", "notices"] });
		void queryClient.invalidateQueries({ queryKey: keys.context(notice.id) });
		void queryClient.invalidateQueries({ queryKey: keys.restrictions });
	};
	const decide = useMutation({
		mutationFn: () =>
			decideAdminNotice({
				data: { noticeId: notice.id, action, note: note || undefined, duration, scope },
			}),
		onSuccess: () => {
			invalidate();
			onDone();
		},
		onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
	});
	const resend = useMutation({
		mutationFn: (which: "statement" | "notifier") =>
			resendAdminNoticeMail({ data: { noticeId: notice.id, which } }),
		onSuccess: invalidate,
	});
	const onFailure = (err: unknown) => setError(err instanceof Error ? err.message : "Failed");
	const lift = useMutation({
		mutationFn: (id: string) => liftAdminRestriction({ data: { id } }),
		onSuccess: invalidate,
		onError: onFailure,
	});
	const unban = useMutation({
		mutationFn: (userId: string) => unbanAdminUser({ data: { userId } }),
		onSuccess: invalidate,
		onError: onFailure,
	});

	const actions = context.data?.actions ?? ["reject"];
	const targetUser = context.data?.targetUser ?? null;
	const isOpen = notice.status === "open";
	const needsTarget = action !== "reject" && !notice.targetUserId;

	return (
		<div className="space-y-4 text-sm">
			<div className="grid gap-3 sm:grid-cols-2">
				<div>
					<h4 className="mb-1 font-medium text-muted-foreground text-xs">Notice</h4>
					<p>
						{NOTICE_REASON_LABELS[notice.reason]} · {notice.source} · {formatDate(notice.createdAt)}
					</p>
					<p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-2">{notice.text}</p>
					<p className="mt-2 text-muted-foreground text-xs">
						Notifier:{" "}
						{notice.notifierUserId
							? `user ${notice.notifierUserId}`
							: notice.notifierName
								? `${notice.notifierName} <${notice.notifierEmail}>`
								: "removed"}
					</p>
				</div>
				<div>
					<h4 className="mb-1 font-medium text-muted-foreground text-xs">
						Snapshot at report time
					</h4>
					{notice.targetSnapshot ? (
						<dl className="space-y-1">
							{Object.entries(notice.targetSnapshot).map(([k, v]) => (
								<div key={k} className="flex gap-2">
									<dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
									<dd className="whitespace-pre-wrap break-words">{v ?? "—"}</dd>
								</div>
							))}
						</dl>
					) : (
						<p className="text-muted-foreground">
							Not resolved. Location as typed: <code>{notice.targetRef}</code>
						</p>
					)}
					<h4 className="mt-3 mb-1 font-medium text-muted-foreground text-xs">Now</h4>
					{context.isPending ? (
						<p className="text-muted-foreground">Loading…</p>
					) : context.data?.live ? (
						<dl className="space-y-1">
							<div className="font-medium">{context.data.live.title}</div>
							{context.data.live.fields.map((f) => (
								<div key={f.label} className="flex gap-2">
									<dt className="w-24 shrink-0 text-muted-foreground">{f.label}</dt>
									<dd className="max-h-40 overflow-auto whitespace-pre-wrap break-words">
										{f.value ?? "—"}
									</dd>
								</div>
							))}
						</dl>
					) : (
						<p className="text-muted-foreground">Gone or never resolved.</p>
					)}
					{targetUser && (
						<p className="mt-2 text-muted-foreground text-xs">
							Account: {targetUser.name} ({targetUser.email})
							{targetUser.banned && (
								<>
									{" "}
									· banned{" "}
									<button
										type="button"
										className="underline disabled:opacity-50"
										disabled={unban.isPending}
										onClick={() => unban.mutate(targetUser.id)}
									>
										unban
									</button>
								</>
							)}
						</p>
					)}
				</div>
			</div>

			{context.data && context.data.restrictions.length > 0 && (
				<div>
					<h4 className="mb-1 font-medium text-muted-foreground text-xs">
						Restrictions on this user
					</h4>
					<ul className="space-y-1">
						{context.data.restrictions.map((r) => (
							<li key={r.id} className="flex items-center gap-2">
								<span>
									{r.kind} · {r.until ? `until ${formatDate(r.until)}` : "permanent"} · by{" "}
									{r.createdBy}
									{r.liftedAt ? ` · lifted ${formatDate(r.liftedAt)}` : ""}
								</span>
								{!r.liftedAt && (
									<Button
										size="sm"
										variant="outline"
										disabled={lift.isPending}
										onClick={() => lift.mutate(r.id)}
									>
										Lift
									</Button>
								)}
							</li>
						))}
					</ul>
				</div>
			)}

			{isOpen ? (
				<div className="space-y-2 rounded-md border border-border p-3">
					<div className="flex flex-wrap items-center gap-2">
						<select
							value={action}
							onChange={(e) => setAction(e.target.value as NoticeActionKind)}
							className="rounded-md border border-border bg-background px-2 py-1"
						>
							{actions.map((a) => (
								<option key={a} value={a}>
									{ACTION_LABELS[a]}
								</option>
							))}
						</select>
						{action === "take_down_book" && notice.targetType === "shared_book" && (
							<select
								value={scope}
								onChange={(e) => setScope(e.target.value as TakedownScope)}
								className="rounded-md border border-border bg-background px-2 py-1"
							>
								<option value="copy">This copy only</option>
								<option value="origin">Every copy of this origin</option>
							</select>
						)}
						{action === "suspend_sharing" && (
							<select
								value={duration}
								onChange={(e) => setDuration(e.target.value as SuspensionDuration)}
								className="rounded-md border border-border bg-background px-2 py-1"
							>
								<option value="7d">7 days</option>
								<option value="30d">30 days</option>
								<option value="permanent">Permanent</option>
							</select>
						)}
					</div>
					<textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Facts for the statement of reasons (the user reads this). Never name the notifier."
						className="min-h-20 w-full rounded-md border border-border bg-background p-2"
					/>
					{needsTarget && (
						<p className="text-destructive text-xs">
							This notice did not resolve to an account; only rejecting is possible.
						</p>
					)}
					{error && <p className="text-destructive text-xs">{error}</p>}
					<Button
						size="sm"
						variant={action === "reject" ? "outline" : "destructive"}
						disabled={decide.isPending || needsTarget}
						onClick={() => decide.mutate()}
					>
						{ACTION_LABELS[action]}
					</Button>
				</div>
			) : (
				<div className="space-y-1 rounded-md border border-border p-3">
					<p>
						<strong>{STATUS_LABELS[notice.status]}</strong> · {notice.decision} ·{" "}
						{formatDate(notice.decidedAt)} · by {notice.decidedBy}
					</p>
					{notice.decisionNote && <p className="whitespace-pre-wrap">{notice.decisionNote}</p>}
					{error && <p className="text-destructive text-xs">{error}</p>}
					{(["statement", "notifier"] as const).map((which) => {
						const state = notice.mailState[which];
						if (!state) return null;
						return (
							<p key={which} className="flex items-center gap-2 text-xs">
								<span>
									{which === "statement" ? "Statement of reasons" : "Notifier decision"} mail:{" "}
									<strong>{state.status}</strong>
									{state.status === "failed" ? ` (${state.error})` : ""} · {formatDate(state.at)}
								</span>
								{state.status === "failed" && (
									<Button
										size="sm"
										variant="outline"
										disabled={resend.isPending}
										onClick={() => resend.mutate(which)}
									>
										Resend
									</Button>
								)}
							</p>
						);
					})}
				</div>
			)}
		</div>
	);
}

function RestrictionsSection() {
	const queryClient = useQueryClient();
	const restrictions = useQuery({
		queryKey: keys.restrictions,
		queryFn: () => getAdminRestrictions(),
	});
	const lift = useMutation({
		mutationFn: (id: string) => liftAdminRestriction({ data: { id } }),
		onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.restrictions }),
	});
	if (!restrictions.data?.length) {
		return <p className="text-muted-foreground text-sm">No active restrictions.</p>;
	}
	return (
		<ul className="space-y-1 text-sm">
			{restrictions.data.map((r) => (
				<li key={r.id} className="flex flex-wrap items-center gap-2">
					<code className="text-xs">{r.userId}</code>
					<span>
						{r.kind} · {r.until ? `until ${formatDate(r.until)}` : "permanent"} · by {r.createdBy} ·{" "}
						{r.reason}
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={lift.isPending}
						onClick={() => lift.mutate(r.id)}
					>
						Lift
					</Button>
				</li>
			))}
		</ul>
	);
}

function NoticesPage() {
	const [filter, setFilter] = React.useState<Filter>({ status: "open" });
	const [openId, setOpenId] = React.useState<string | null>(null);
	const notices = useQuery({
		queryKey: keys.notices(filter),
		queryFn: () => getNotices({ data: filter }),
	});

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-bold text-3xl tracking-tight">Notices</h1>
				<Link to="/admin" className="text-muted-foreground text-sm hover:text-foreground">
					Back to admin
				</Link>
			</div>
			<div className="space-y-8">
				<section className="space-y-3">
					<div className="flex flex-wrap gap-4">
						<Select<NoticeStatus>
							label="Status"
							value={filter.status ?? ""}
							options={(["open", "actioned", "rejected"] as const).map((s) => ({
								value: s,
								label: STATUS_LABELS[s],
							}))}
							onChange={(status) => setFilter({ ...filter, status: status || undefined })}
						/>
						<Select<NoticeTargetType>
							label="Target"
							value={filter.targetType ?? ""}
							options={NOTICE_TARGET_TYPES.map((t) => ({
								value: t,
								label: NOTICE_TARGET_LABELS[t].label,
							}))}
							onChange={(targetType) =>
								setFilter({ ...filter, targetType: targetType || undefined })
							}
						/>
						<Select<NoticeReason>
							label="Reason"
							value={filter.reason ?? ""}
							options={NOTICE_REASONS.map((r) => ({ value: r, label: NOTICE_REASON_LABELS[r] }))}
							onChange={(reason) => setFilter({ ...filter, reason: reason || undefined })}
						/>
					</div>
					{notices.isPending ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : !notices.data?.length ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<ShieldAlert className="size-4" /> Nothing in this view.
						</p>
					) : (
						<ul className="divide-y divide-border rounded-md border border-border">
							{notices.data.map((n) => (
								<li key={n.id}>
									<button
										type="button"
										onClick={() => setOpenId(openId === n.id ? null : n.id)}
										className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40"
									>
										<Badge variant={n.status === "open" ? "default" : "secondary"}>
											{STATUS_LABELS[n.status]}
										</Badge>
										<span className="font-medium">{NOTICE_TARGET_LABELS[n.targetType].label}</span>
										<span className="truncate text-muted-foreground">{n.targetRef}</span>
										<span className="text-muted-foreground">{NOTICE_REASON_LABELS[n.reason]}</span>
										<span className="ml-auto text-muted-foreground text-xs">
											{age(n.createdAt)}
										</span>
									</button>
									{openId === n.id && (
										<div className="border-border border-t bg-muted/20 px-3 py-3">
											<NoticeDetail notice={n} onDone={() => setOpenId(null)} />
										</div>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
				<Separator />
				<section className="space-y-3">
					<h2 className="font-semibold text-base">Active restrictions</h2>
					<RestrictionsSection />
				</section>
			</div>
		</div>
	);
}
