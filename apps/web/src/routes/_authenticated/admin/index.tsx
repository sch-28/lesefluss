import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Activity,
	BookOpen,
	Database,
	EyeOff,
	HardDrive,
	Highlighter,
	Layers,
	Library,
	type LucideIcon,
	Trash2,
	UserPlus,
	Users,
} from "lucide-react";
import * as React from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
	type CatalogStatsResult,
	type CatalogSyncSource,
	deleteAdminBook,
	deleteAdminSeries,
	deleteAdminUser,
	getAdminBooks,
	getAdminSeries,
	getAdminStats,
	getAdminUsers,
	getCatalogStats,
	hardDeleteAdminSeriesTombstones,
	hardDeleteAdminTombstones,
	triggerCatalogSync,
} from "~/lib/admin";
import { cn } from "~/lib/utils";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/_authenticated/admin/")({
	loader: async ({ context }) => {
		if (context.session.user.role !== "admin") throw redirect({ to: "/" });
	},
	head: () => seo({ title: "Admin - Lesefluss", isNoindex: true }),
	component: AdminPage,
});

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const adminKeys = {
	stats: ["admin", "stats"] as const,
	users: ["admin", "users"] as const,
	books: ["admin", "books"] as const,
	series: ["admin", "series"] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
	if (bytes < 1_024) return `${bytes} B`;
	if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
	if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// Stable key for a book row - module-level, no component dependencies.
function bookKey(b: Pick<AdminBook, "userId" | "bookId">): string {
	return `${b.userId}:${b.bookId}`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
	label,
	value,
	icon: Icon,
}: {
	label: string;
	value: string | number | undefined;
	icon: LucideIcon;
}) {
	return (
		<div className="relative overflow-hidden rounded-xl border bg-muted/20 p-4">
			<Icon className="absolute top-3 right-3 size-4 text-muted-foreground/20" />
			<dd className="font-bold text-2xl tabular-nums">{value ?? "—"}</dd>
			<dt className="mt-1 text-muted-foreground text-xs">{label}</dt>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>[number];
type AdminBook = Awaited<ReturnType<typeof getAdminBooks>>[number];
type AdminSeries = Awaited<ReturnType<typeof getAdminSeries>>[number];

function seriesKey(s: Pick<AdminSeries, "userId" | "seriesId">): string {
	return `${s.userId}:${s.seriesId}`;
}

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

function Pagination({
	pageIndex,
	pageCount,
	canPrev,
	canNext,
	onPrev,
	onNext,
}: {
	pageIndex: number;
	pageCount: number;
	canPrev: boolean;
	canNext: boolean;
	onPrev: () => void;
	onNext: () => void;
}) {
	return (
		<div className="flex items-center justify-between pt-2 text-sm">
			<Button variant="outline" size="sm" disabled={!canPrev} onClick={onPrev}>
				← Prev
			</Button>
			<span className="text-muted-foreground text-xs">
				Page {pageIndex + 1} of {pageCount}
			</span>
			<Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
				Next →
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Shared table primitives
// ---------------------------------------------------------------------------

type TableInstance<T> = ReturnType<typeof useReactTable<T>>;

function TableShell<T>({
	table,
	getRowKey,
	expandedKey,
	renderExpandedRow,
}: {
	table: TableInstance<T>;
	getRowKey: (row: T) => string;
	expandedKey?: string | null;
	renderExpandedRow?: (row: T) => React.ReactNode;
}) {
	const colSpan = table.getAllColumns().length;
	const { pageIndex } = table.getState().pagination;

	return (
		<div className="space-y-2">
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						{table.getHeaderGroups().map((hg) => (
							<tr key={hg.id} className="border-b">
								{hg.headers.map((h) => (
									<th
										key={h.id}
										className="py-2 pr-4 text-left font-medium text-muted-foreground text-xs last:pr-0"
									>
										{flexRender(h.column.columnDef.header, h.getContext())}
									</th>
								))}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows.map((row) => {
							const key = getRowKey(row.original);
							return (
								<React.Fragment key={key}>
									<tr className="border-b last:border-0">
										{row.getVisibleCells().map((cell) => (
											<td key={cell.id} className="py-2 pr-4 last:pr-0">
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</td>
										))}
									</tr>
									{renderExpandedRow && expandedKey === key && (
										<tr>
											<td colSpan={colSpan} className="bg-muted/20 px-3 py-3 text-sm">
												{renderExpandedRow(row.original)}
											</td>
										</tr>
									)}
								</React.Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
			<Pagination
				pageIndex={pageIndex}
				pageCount={table.getPageCount()}
				canPrev={table.getCanPreviousPage()}
				canNext={table.getCanNextPage()}
				onPrev={() => table.previousPage()}
				onNext={() => table.nextPage()}
			/>
		</div>
	);
}

function DeleteAction({
	isActive,
	isPending,
	onActivate,
	onConfirm,
	onCancel,
}: {
	isActive: boolean;
	isPending: boolean;
	onActivate: () => void;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	if (isActive) {
		return (
			<>
				<Button variant="destructive" size="sm" disabled={isPending} onClick={onConfirm}>
					Confirm
				</Button>
				<Button variant="outline" size="sm" disabled={isPending} onClick={onCancel}>
					Cancel
				</Button>
			</>
		);
	}
	return (
		<Button variant="outline" size="sm" onClick={onActivate}>
			Delete
		</Button>
	);
}

type CleanupController = {
	isConfirming: boolean;
	isPending: boolean;
	onActivate: () => void;
	onCancel: () => void;
	onConfirm: () => void;
};

function TombstoneToolbar({
	users,
	filter,
	onFilterChange,
	showTombstones,
	onShowTombstonesChange,
	tombstonesInScope,
	cleanupLabel,
	cleanup,
}: {
	users: AdminUser[];
	filter: string;
	onFilterChange: (id: string) => void;
	showTombstones: boolean;
	onShowTombstonesChange: (next: boolean) => void;
	tombstonesInScope: number;
	cleanupLabel: string;
	cleanup: CleanupController;
}) {
	const filterId = React.useId();
	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="flex items-center gap-2">
				<label htmlFor={filterId} className="text-muted-foreground text-xs">
					Filter by user
				</label>
				<select
					id={filterId}
					value={filter}
					onChange={(e) => onFilterChange(e.target.value)}
					className="rounded border bg-background px-2 py-1 text-xs"
				>
					<option value="all">All users</option>
					{users.map((u) => (
						<option key={u.id} value={u.id}>
							{u.email}
						</option>
					))}
				</select>
			</div>
			<label className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<input
					type="checkbox"
					checked={showTombstones}
					onChange={(e) => onShowTombstonesChange(e.target.checked)}
				/>
				Show tombstones ({tombstonesInScope})
			</label>
			<div className="ml-auto flex items-center gap-2">
				{cleanup.isConfirming ? (
					<>
						<Button
							variant="destructive"
							size="sm"
							disabled={cleanup.isPending}
							onClick={cleanup.onConfirm}
						>
							Confirm cleanup ({tombstonesInScope})
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={cleanup.isPending}
							onClick={cleanup.onCancel}
						>
							Cancel
						</Button>
					</>
				) : (
					<Button
						variant="outline"
						size="sm"
						disabled={tombstonesInScope === 0}
						onClick={cleanup.onActivate}
					>
						{cleanupLabel}
					</Button>
				)}
			</div>
		</div>
	);
}

// Owns the filter/show-tombstones/cleanup-confirm state for any tombstone-aware
// table. Generic over the cleanup result so each table can format its own
// post-cleanup notice. Callbacks are ref-stabilized so the parent can pass
// inline arrows without invalidating handleCleanup on every render.
function useTombstoneState<TResult>(opts: {
	cleanup: (scope: { userId?: string }) => Promise<TResult>;
	onInvalidate: () => Promise<void> | void;
}) {
	const cleanupRef = React.useRef(opts.cleanup);
	cleanupRef.current = opts.cleanup;
	const onInvalidateRef = React.useRef(opts.onInvalidate);
	onInvalidateRef.current = opts.onInvalidate;

	const [filter, setFilterState] = React.useState("all");
	const [showTombstones, setShowTombstonesState] = React.useState(false);
	const [isConfirmingCleanup, setConfirmingCleanup] = React.useState(false);
	const [isCleanupPending, setCleanupPending] = React.useState(false);
	const [lastCleanup, setLastCleanup] = React.useState<TResult | null>(null);

	const setFilter = React.useCallback((id: string) => {
		setFilterState(id);
		setConfirmingCleanup(false);
	}, []);

	const setShowTombstones = React.useCallback((next: boolean) => {
		setShowTombstonesState(next);
		setConfirmingCleanup(false);
	}, []);

	const handleCleanup = React.useCallback(async () => {
		setCleanupPending(true);
		try {
			const result = await cleanupRef.current({
				userId: filter === "all" ? undefined : filter,
			});
			await onInvalidateRef.current();
			setLastCleanup(result);
			setConfirmingCleanup(false);
		} finally {
			setCleanupPending(false);
		}
	}, [filter]);

	const cleanupController = React.useMemo<CleanupController>(
		() => ({
			isConfirming: isConfirmingCleanup,
			isPending: isCleanupPending,
			onActivate: () => setConfirmingCleanup(true),
			onCancel: () => setConfirmingCleanup(false),
			onConfirm: handleCleanup,
		}),
		[isConfirmingCleanup, isCleanupPending, handleCleanup],
	);

	return {
		filter,
		setFilter,
		showTombstones,
		setShowTombstones,
		lastCleanup,
		cleanupController,
	};
}

// Owns the per-row delete confirmation state and ref-stabilized handler for any
// table. Returns a `stateRef` plus a `handleDeleteRef` so column definitions
// stay stable while reading the latest state and mutation closure. The hook
// return itself is memoized so consumers can use it as a useMemo dep.
function useConfirmDelete<TArgs extends unknown[]>(opts: {
	mutate: (...args: TArgs) => Promise<unknown>;
	onAfterSuccess?: (...args: TArgs) => void;
}) {
	const mutateRef = React.useRef(opts.mutate);
	mutateRef.current = opts.mutate;
	const onAfterSuccessRef = React.useRef(opts.onAfterSuccess);
	onAfterSuccessRef.current = opts.onAfterSuccess;

	const [confirming, setConfirming] = React.useState<string | null>(null);
	const [isPending, setPending] = React.useState(false);

	const stateRef = React.useRef({ confirming, isPending });
	stateRef.current = { confirming, isPending };

	const handleDelete = async (...args: TArgs) => {
		setPending(true);
		try {
			await mutateRef.current(...args);
			setConfirming(null);
			onAfterSuccessRef.current?.(...args);
		} finally {
			setPending(false);
		}
	};

	const handleDeleteRef = React.useRef(handleDelete);
	handleDeleteRef.current = handleDelete;

	return React.useMemo(() => ({ setConfirming, stateRef, handleDeleteRef }), []);
}

// ---------------------------------------------------------------------------
// Users table
// ---------------------------------------------------------------------------

function UsersTable() {
	const qc = useQueryClient();
	const { data: users = [], isLoading } = useQuery({
		queryKey: adminKeys.users,
		queryFn: () => getAdminUsers(),
	});
	// Books fetched here (shared key with BooksTable - react-query deduplicates)
	// so we can show a user's books in the expand row without an extra request.
	const { data: books = [] } = useQuery({
		queryKey: adminKeys.books,
		queryFn: () => getAdminBooks(),
	});

	const [expanded, setExpanded] = React.useState<string | null>(null);
	const expandedRef = React.useRef(expanded);
	expandedRef.current = expanded;

	const del = useConfirmDelete<[userId: string]>({
		mutate: async (userId) => {
			await deleteAdminUser({ data: { userId } });
			await Promise.all([
				qc.invalidateQueries({ queryKey: adminKeys.users }),
				qc.invalidateQueries({ queryKey: adminKeys.books }),
				qc.invalidateQueries({ queryKey: adminKeys.series }),
				qc.invalidateQueries({ queryKey: adminKeys.stats }),
			]);
		},
		onAfterSuccess: (userId) => {
			if (expandedRef.current === userId) setExpanded(null);
		},
	});

	const columns = React.useMemo<ColumnDef<AdminUser>[]>(
		() => [
			{
				accessorKey: "email",
				header: "Email",
				cell: ({ row }) => <span className="font-mono text-xs">{row.original.email}</span>,
			},
			{
				accessorKey: "createdAt",
				header: "Joined",
				cell: ({ row }) => (
					<span className="text-muted-foreground tabular-nums">
						{formatDate(row.original.createdAt)}
					</span>
				),
			},
			{
				accessorKey: "bookCount",
				header: "Books",
				cell: ({ row }) => <span className="tabular-nums">{row.original.bookCount}</span>,
			},
			{
				accessorKey: "highlightCount",
				header: "Highlights",
				cell: ({ row }) => <span className="tabular-nums">{row.original.highlightCount}</span>,
			},
			{
				id: "actions",
				header: () => <span className="block text-right">Actions</span>,
				cell: ({ row }) => {
					const u = row.original;
					const s = del.stateRef.current;
					return (
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setExpanded(expandedRef.current === u.id ? null : u.id)}
							>
								{expandedRef.current === u.id ? "Hide" : "Details"}
							</Button>
							<DeleteAction
								isActive={s.confirming === u.id}
								isPending={s.isPending}
								onActivate={() => del.setConfirming(u.id)}
								onCancel={() => del.setConfirming(null)}
								onConfirm={() => del.handleDeleteRef.current(u.id)}
							/>
						</div>
					);
				},
			},
		],
		[del],
	);

	const table = useReactTable({
		data: users,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 20 } },
	});

	if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
	if (users.length === 0) return <p className="text-muted-foreground text-sm">No users.</p>;

	const renderExpanded = (u: AdminUser) => {
		const userBooks = books.filter((b) => b.userId === u.id);
		return (
			<>
				<p className="mb-1.5 font-medium text-muted-foreground text-xs">Books</p>
				{userBooks.length === 0 ? (
					<p className="text-muted-foreground text-xs">No books.</p>
				) : (
					<ul className="space-y-0.5">
						{userBooks.map((b) => (
							<li key={b.bookId} className="text-xs">
								{b.title}
								{b.author ? ` - ${b.author}` : ""}
								{b.fileSize ? ` (${formatBytes(b.fileSize)})` : ""}
							</li>
						))}
					</ul>
				)}
			</>
		);
	};

	return (
		<TableShell
			table={table}
			getRowKey={(u) => u.id}
			expandedKey={expanded}
			renderExpandedRow={renderExpanded}
		/>
	);
}

// ---------------------------------------------------------------------------
// Books table
// ---------------------------------------------------------------------------

function BooksTable() {
	const qc = useQueryClient();
	const { data: books = [], isLoading } = useQuery({
		queryKey: adminKeys.books,
		queryFn: () => getAdminBooks(),
	});
	// Users fetched here (shared key with UsersTable - react-query deduplicates)
	// so we can populate the filter dropdown without an extra request.
	const { data: users = [] } = useQuery({
		queryKey: adminKeys.users,
		queryFn: () => getAdminUsers(),
	});
	// Stats provides authoritative tombstone counts (per-user and global) so the
	// cleanup button label is correct even when the row list is capped server-side.
	const { data: stats } = useQuery({
		queryKey: adminKeys.stats,
		queryFn: () => getAdminStats(),
	});

	const [expanded, setExpanded] = React.useState<string | null>(null);
	const expandedRef = React.useRef(expanded);
	expandedRef.current = expanded;

	const invalidateBooks = React.useCallback(async () => {
		await Promise.all([
			qc.invalidateQueries({ queryKey: adminKeys.books }),
			qc.invalidateQueries({ queryKey: adminKeys.stats }),
		]);
	}, [qc]);

	const { filter, setFilter, showTombstones, setShowTombstones, lastCleanup, cleanupController } =
		useTombstoneState({
			cleanup: (scope) => hardDeleteAdminTombstones({ data: scope }),
			onInvalidate: invalidateBooks,
		});

	const filtered = React.useMemo(
		() =>
			books.filter(
				(b) => (showTombstones || !b.deleted) && (filter === "all" || b.userId === filter),
			),
		[books, filter, showTombstones],
	);

	const tombstonesInScope = React.useMemo(() => {
		if (!stats) return 0;
		if (filter === "all") return stats.bookTombstoneTotal;
		return stats.bookTombstonesByUser.find((r) => r.userId === filter)?.count ?? 0;
	}, [stats, filter]);

	const del = useConfirmDelete<[userId: string, bookId: string]>({
		mutate: async (userId, bookId) => {
			await deleteAdminBook({ data: { userId, bookId } });
			await invalidateBooks();
		},
		onAfterSuccess: (userId, bookId) => {
			const key = bookKey({ userId, bookId });
			if (expandedRef.current === key) setExpanded(null);
		},
	});

	const columns = React.useMemo<ColumnDef<AdminBook>[]>(
		() => [
			{
				id: "title",
				header: "Title",
				cell: ({ row }) => {
					const b = row.original;
					return (
						<div>
							<div className="flex items-center gap-2">
								<span
									className={cn("font-medium", b.deleted && "text-muted-foreground line-through")}
								>
									{b.title}
								</span>
								{b.deleted && (
									<Badge variant="outline" className="text-muted-foreground">
										tombstone
									</Badge>
								)}
							</div>
							{b.author && <div className="text-muted-foreground text-xs">{b.author}</div>}
						</div>
					);
				},
			},
			{
				id: "user",
				header: "User",
				cell: ({ row }) => (
					<span className="font-mono text-muted-foreground text-xs">
						{row.original.userEmail ?? row.original.userId}
					</span>
				),
			},
			{
				id: "size",
				header: "Size",
				cell: ({ row }) => (
					<span className="text-muted-foreground tabular-nums">
						{row.original.fileSize ? formatBytes(row.original.fileSize) : "-"}
					</span>
				),
			},
			{
				accessorKey: "updatedAt",
				header: "Updated",
				cell: ({ row }) => (
					<span className="text-muted-foreground tabular-nums">
						{formatDate(row.original.updatedAt)}
					</span>
				),
			},
			{
				id: "actions",
				header: () => <span className="block text-right">Actions</span>,
				cell: ({ row }) => {
					const b = row.original;
					const key = bookKey(b);
					const s = del.stateRef.current;
					return (
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setExpanded(expandedRef.current === key ? null : key)}
							>
								{expandedRef.current === key ? "Hide" : "Details"}
							</Button>
							{!b.deleted && (
								<DeleteAction
									isActive={s.confirming === key}
									isPending={s.isPending}
									onActivate={() => del.setConfirming(key)}
									onCancel={() => del.setConfirming(null)}
									onConfirm={() => del.handleDeleteRef.current(b.userId, b.bookId)}
								/>
							)}
						</div>
					);
				},
			},
		],
		[del],
	);

	const table = useReactTable({
		data: filtered,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 20 } },
	});

	const handleFilterChange = (id: string) => {
		setFilter(id);
		table.setPageIndex(0);
	};
	const handleShowTombstonesChange = (next: boolean) => {
		setShowTombstones(next);
		table.setPageIndex(0);
	};

	const toolbar = (
		<TombstoneToolbar
			users={users}
			filter={filter}
			onFilterChange={handleFilterChange}
			showTombstones={showTombstones}
			onShowTombstonesChange={handleShowTombstonesChange}
			tombstonesInScope={tombstonesInScope}
			cleanupLabel="Cleanup tombstones"
			cleanup={cleanupController}
		/>
	);

	const cleanupNotice = lastCleanup && (
		<p className="text-muted-foreground text-xs">
			Removed {lastCleanup.booksRemoved} tombstoned books and {lastCleanup.highlightsRemoved}{" "}
			tombstoned highlights.
		</p>
	);

	const allHidden = filtered.length === 0 && tombstonesInScope > 0 && !showTombstones;
	const emptyMessage = allHidden
		? `All books in scope are tombstoned (${tombstonesInScope}). Toggle "Show tombstones" to view.`
		: "No books.";

	if (isLoading)
		return (
			<>
				{toolbar}
				<p className="text-muted-foreground text-sm">Loading…</p>
			</>
		);
	if (filtered.length === 0)
		return (
			<>
				{toolbar}
				{cleanupNotice}
				<p className="text-muted-foreground text-sm">{emptyMessage}</p>
			</>
		);

	const renderExpanded = (b: AdminBook) => {
		const progress = b.fileSize && b.position ? Math.round((b.position / b.fileSize) * 100) : 0;
		return (
			<dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
				<div>
					<dt className="text-muted-foreground">Words</dt>
					<dd className="tabular-nums">{b.wordCount?.toLocaleString() ?? "-"}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Progress</dt>
					<dd className="tabular-nums">{progress}%</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Position</dt>
					<dd className="tabular-nums">{b.position.toLocaleString()} B</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Book ID</dt>
					<dd className="font-mono">{b.bookId}</dd>
				</div>
			</dl>
		);
	};

	return (
		<div className="space-y-3">
			{toolbar}
			{cleanupNotice}
			<TableShell
				table={table}
				getRowKey={bookKey}
				expandedKey={expanded}
				renderExpandedRow={renderExpanded}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Series table
// ---------------------------------------------------------------------------

function SeriesTable() {
	const qc = useQueryClient();
	const { data: series = [], isLoading } = useQuery({
		queryKey: adminKeys.series,
		queryFn: () => getAdminSeries(),
	});
	const { data: users = [] } = useQuery({
		queryKey: adminKeys.users,
		queryFn: () => getAdminUsers(),
	});
	const { data: stats } = useQuery({
		queryKey: adminKeys.stats,
		queryFn: () => getAdminStats(),
	});

	const invalidateSeries = React.useCallback(async () => {
		await Promise.all([
			qc.invalidateQueries({ queryKey: adminKeys.series }),
			qc.invalidateQueries({ queryKey: adminKeys.books }),
			qc.invalidateQueries({ queryKey: adminKeys.stats }),
		]);
	}, [qc]);

	const { filter, setFilter, showTombstones, setShowTombstones, lastCleanup, cleanupController } =
		useTombstoneState({
			cleanup: (scope) => hardDeleteAdminSeriesTombstones({ data: scope }),
			onInvalidate: invalidateSeries,
		});

	const filtered = React.useMemo(
		() =>
			series.filter(
				(s) => (showTombstones || !s.deleted) && (filter === "all" || s.userId === filter),
			),
		[series, filter, showTombstones],
	);

	const tombstonesInScope = React.useMemo(() => {
		if (!stats) return 0;
		if (filter === "all") return stats.seriesTombstoneTotal;
		return stats.seriesTombstonesByUser.find((r) => r.userId === filter)?.count ?? 0;
	}, [stats, filter]);

	const del = useConfirmDelete<[userId: string, seriesId: string]>({
		mutate: async (userId, seriesId) => {
			await deleteAdminSeries({ data: { userId, seriesId } });
			await invalidateSeries();
		},
	});

	const columns = React.useMemo<ColumnDef<AdminSeries>[]>(
		() => [
			{
				id: "title",
				header: "Title",
				cell: ({ row }) => {
					const s = row.original;
					return (
						<div>
							<div className="flex items-center gap-2">
								<span
									className={cn("font-medium", s.deleted && "text-muted-foreground line-through")}
								>
									{s.title}
								</span>
								<Badge variant="outline" className="text-muted-foreground">
									{s.provider}
								</Badge>
								{s.deleted && (
									<Badge variant="outline" className="text-muted-foreground">
										tombstone
									</Badge>
								)}
							</div>
							{s.author && <div className="text-muted-foreground text-xs">{s.author}</div>}
						</div>
					);
				},
			},
			{
				id: "user",
				header: "User",
				cell: ({ row }) => (
					<span className="font-mono text-muted-foreground text-xs">
						{row.original.userEmail ?? row.original.userId}
					</span>
				),
			},
			{
				id: "chapters",
				header: "Chapters",
				cell: ({ row }) => <span className="tabular-nums">{row.original.chapterCount}</span>,
			},
			{
				id: "size",
				header: "Size",
				cell: ({ row }) => (
					<span className="text-muted-foreground tabular-nums">
						{row.original.totalSize > 0 ? formatBytes(row.original.totalSize) : "-"}
					</span>
				),
			},
			{
				accessorKey: "updatedAt",
				header: "Updated",
				cell: ({ row }) => (
					<span className="text-muted-foreground tabular-nums">
						{formatDate(row.original.updatedAt)}
					</span>
				),
			},
			{
				id: "actions",
				header: () => <span className="block text-right">Actions</span>,
				cell: ({ row }) => {
					const s = row.original;
					const key = seriesKey(s);
					const ref = del.stateRef.current;
					if (s.deleted) return null;
					return (
						<div className="flex items-center justify-end gap-2">
							<DeleteAction
								isActive={ref.confirming === key}
								isPending={ref.isPending}
								onActivate={() => del.setConfirming(key)}
								onCancel={() => del.setConfirming(null)}
								onConfirm={() => del.handleDeleteRef.current(s.userId, s.seriesId)}
							/>
						</div>
					);
				},
			},
		],
		[del],
	);

	const table = useReactTable({
		data: filtered,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 20 } },
	});

	const handleFilterChange = (id: string) => {
		setFilter(id);
		table.setPageIndex(0);
	};
	const handleShowTombstonesChange = (next: boolean) => {
		setShowTombstones(next);
		table.setPageIndex(0);
	};

	const toolbar = (
		<TombstoneToolbar
			users={users}
			filter={filter}
			onFilterChange={handleFilterChange}
			showTombstones={showTombstones}
			onShowTombstonesChange={handleShowTombstonesChange}
			tombstonesInScope={tombstonesInScope}
			cleanupLabel="Cleanup series tombstones"
			cleanup={cleanupController}
		/>
	);

	const cleanupNotice = lastCleanup && (
		<p className="text-muted-foreground text-xs">
			Removed {lastCleanup.seriesRemoved} tombstoned series and {lastCleanup.chaptersRemoved}{" "}
			tombstoned chapters.
		</p>
	);

	const allHidden = filtered.length === 0 && tombstonesInScope > 0 && !showTombstones;
	const emptyMessage = allHidden
		? `All series in scope are tombstoned (${tombstonesInScope}). Toggle "Show tombstones" to view.`
		: "No series.";

	if (isLoading)
		return (
			<>
				{toolbar}
				<p className="text-muted-foreground text-sm">Loading…</p>
			</>
		);
	if (filtered.length === 0)
		return (
			<>
				{toolbar}
				{cleanupNotice}
				<p className="text-muted-foreground text-sm">{emptyMessage}</p>
			</>
		);

	return (
		<div className="space-y-3">
			{toolbar}
			{cleanupNotice}
			<TableShell table={table} getRowKey={seriesKey} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Catalog section
// ---------------------------------------------------------------------------

const catalogKeys = {
	stats: ["admin", "catalog", "stats"] as const,
};

const CATALOG_SYNC_SOURCES: readonly { key: CatalogSyncSource; label: string }[] = [
	{ key: "gutenberg", label: "Sync Gutenberg" },
	{ key: "standard_ebooks", label: "Sync Standard Ebooks" },
	{ key: "all", label: "Sync All" },
];

function formatDateTime(iso: string | null): string {
	if (!iso) return "never";
	return new Date(iso).toLocaleString();
}

function isCatalogSyncRunning(r: CatalogStatsResult | undefined): boolean {
	return r?.ok === true && r.data.sync.running;
}

function CatalogSection() {
	const qc = useQueryClient();
	const {
		data: result,
		isLoading,
		error,
	} = useQuery({
		queryKey: catalogKeys.stats,
		queryFn: () => getCatalogStats(),
		refetchInterval: (q) => (isCatalogSyncRunning(q.state.data) ? 3000 : 30_000),
		refetchIntervalInBackground: false,
	});

	const syncMutation = useMutation({
		mutationFn: async (source: CatalogSyncSource) => {
			const r = await triggerCatalogSync({ data: { source } });
			if (!r.ok) throw new Error(r.error);
			return r;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.stats }),
	});

	if (isLoading) return <p className="text-muted-foreground text-sm">Loading catalog…</p>;

	const errMsg = error
		? error instanceof Error
			? error.message
			: "unknown error"
		: !result
			? "no response"
			: !result.ok
				? result.error
				: null;
	if (errMsg) return <p className="text-destructive text-sm">Catalog unavailable: {errMsg}</p>;

	// Narrow: isLoading handled, errMsg null ⇒ result.ok === true
	if (!result?.ok) return null;

	const { sync, counts } = result.data;
	const running = sync.running;
	const disabled = running || syncMutation.isPending;

	return (
		<div className="space-y-4">
			<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard icon={Library} label="Gutenberg" value={counts.gutenberg} />
				<StatCard icon={BookOpen} label="Standard Ebooks" value={counts.standardEbooks} />
				<StatCard icon={EyeOff} label="Suppressed" value={counts.suppressed} />
				<StatCard icon={Database} label="Total" value={counts.total} />
			</dl>

			<div className="space-y-2 rounded-xl border bg-muted/20 p-4 text-sm">
				<div className="flex items-center gap-2">
					<span
						className={`inline-block size-2 rounded-full ${
							running
								? "animate-pulse bg-blue-500"
								: sync.lastError
									? "bg-destructive"
									: "bg-emerald-500"
						}`}
					/>
					<span className="font-medium">
						{running ? "Running" : sync.lastError ? "Error" : "Idle"}
					</span>
					{running && sync.currentSource && (
						<span className="text-muted-foreground text-xs">
							· {sync.currentSource}
							{sync.phase ? ` · ${sync.phase}` : ""} · upserted{" "}
							<span className="tabular-nums">{sync.booksUpserted.toLocaleString()}</span>
							{sync.booksSuppressed > 0 && (
								<>
									{" "}
									· suppressed{" "}
									<span className="tabular-nums">{sync.booksSuppressed.toLocaleString()}</span>
								</>
							)}
						</span>
					)}
				</div>
				<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs sm:grid-cols-3">
					<div>
						<dt className="inline">Last started: </dt>
						<dd className="inline tabular-nums">{formatDateTime(sync.lastStartedAt)}</dd>
					</div>
					<div>
						<dt className="inline">Last finished: </dt>
						<dd className="inline tabular-nums">{formatDateTime(sync.lastFinishedAt)}</dd>
					</div>
				</dl>
				{sync.lastError && (
					<p className="break-words rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs">
						{sync.lastError}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<div className="flex flex-wrap gap-2">
					{CATALOG_SYNC_SOURCES.map(({ key, label }) => (
						<Button
							key={key}
							variant="outline"
							size="sm"
							disabled={disabled}
							onClick={() => syncMutation.mutate(key)}
						>
							{label}
						</Button>
					))}
				</div>
				{syncMutation.error && (
					<p className="text-destructive text-xs">
						Sync trigger failed: {syncMutation.error.message}
					</p>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AdminPage() {
	const { data: stats } = useQuery({
		queryKey: adminKeys.stats,
		queryFn: () => getAdminStats(),
	});

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
			<h1 className="mb-6 font-bold text-3xl tracking-tight">Admin</h1>
			<div className="space-y-8">
				<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatCard icon={Users} label="Total Users" value={stats?.userTotal} />
					<StatCard icon={BookOpen} label="Books" value={stats?.bookTotal} />
					<StatCard icon={Layers} label="Series" value={stats?.seriesTotal} />
					<StatCard icon={Trash2} label="Tombstones" value={stats?.bookTombstoneTotal} />
					<StatCard
						icon={HardDrive}
						label="Storage"
						value={stats && formatBytes(stats.storageTotalBytes)}
					/>
					<StatCard icon={Activity} label="Active Sessions" value={stats?.activeSessions} />
					<StatCard icon={UserPlus} label="New (7d)" value={stats?.usersLast7d} />
					<StatCard icon={UserPlus} label="New (30d)" value={stats?.usersLast30d} />
					<StatCard icon={Library} label="Users with books" value={stats?.usersWithBooks} />
					<StatCard icon={Highlighter} label="Highlights" value={stats?.highlightTotal} />
				</dl>
				<Separator />
				<section className="space-y-4">
					<h2 className="font-semibold text-base">All Users</h2>
					<UsersTable />
				</section>
				<Separator />
				<section className="space-y-4">
					<h2 className="font-semibold text-base">All Books</h2>
					<BooksTable />
				</section>
				<Separator />
				<section className="space-y-4">
					<h2 className="font-semibold text-base">All Series</h2>
					<SeriesTable />
				</section>
				<Separator />
				<section className="space-y-4">
					<h2 className="font-semibold text-base">Catalog</h2>
					<CatalogSection />
				</section>
			</div>
		</div>
	);
}
