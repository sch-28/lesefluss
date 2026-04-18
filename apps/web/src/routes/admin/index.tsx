import { useQuery, useQueryClient } from "@tanstack/react-query";
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
	HardDrive,
	Highlighter,
	Library,
	type LucideIcon,
	UserPlus,
	Users,
} from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
	deleteAdminBook,
	deleteAdminUser,
	getAdminBooks,
	getAdminStats,
	getAdminUsers,
} from "~/lib/admin";
import { getSession } from "~/lib/get-session";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/admin/")({
	loader: async () => {
		const s = await getSession();
		if (!s) throw redirect({ to: "/login" });
		if (s.user.role !== "admin") throw redirect({ to: "/" });
		return getAdminStats();
	},
	head: () => seo({ title: "Admin - Lesefluss", isNoindex: true }),
	component: AdminPage,
});

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const adminKeys = {
	users: ["admin", "users"] as const,
	books: ["admin", "books"] as const,
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
	value: string | number;
	icon: LucideIcon;
}) {
	return (
		<div className="relative overflow-hidden rounded-xl border bg-muted/20 p-4">
			<Icon className="absolute top-3 right-3 size-4 text-muted-foreground/20" />
			<dd className="font-bold text-2xl tabular-nums">{value}</dd>
			<dt className="mt-1 text-muted-foreground text-xs">{label}</dt>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>[number];
type AdminBook = Awaited<ReturnType<typeof getAdminBooks>>[number];

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
	const [confirming, setConfirming] = React.useState<string | null>(null);
	const [pending, setPending] = React.useState(false);

	// Refs so column definitions stay stable while cells always read latest state.
	const stateRef = React.useRef({ expanded, confirming, pending });
	stateRef.current = { expanded, confirming, pending };

	async function handleDelete(userId: string) {
		setPending(true);
		try {
			await deleteAdminUser({ data: { userId } });
			await Promise.all([
				qc.invalidateQueries({ queryKey: adminKeys.users }),
				qc.invalidateQueries({ queryKey: adminKeys.books }),
			]);
			setConfirming(null);
			if (stateRef.current.expanded === userId) setExpanded(null);
		} finally {
			setPending(false);
		}
	}

	const handleDeleteRef = React.useRef(handleDelete);
	handleDeleteRef.current = handleDelete;

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
					const { expanded, confirming, pending } = stateRef.current;
					return (
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setExpanded(expanded === u.id ? null : u.id)}
							>
								{expanded === u.id ? "Hide" : "Details"}
							</Button>
							{confirming === u.id ? (
								<>
									<Button
										variant="destructive"
										size="sm"
										disabled={pending}
										onClick={() => handleDeleteRef.current(u.id)}
									>
										Confirm
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={pending}
										onClick={() => setConfirming(null)}
									>
										Cancel
									</Button>
								</>
							) : (
								<Button variant="outline" size="sm" onClick={() => setConfirming(u.id)}>
									Delete
								</Button>
							)}
						</div>
					);
				},
			},
		],
		[], // stable - state is read via stateRef.current at render time
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
							const u = row.original;
							return (
								<React.Fragment key={u.id}>
									<tr className="border-b last:border-0">
										{row.getVisibleCells().map((cell) => (
											<td key={cell.id} className="py-2 pr-4 last:pr-0">
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</td>
										))}
									</tr>
									{expanded === u.id && (
										<tr>
											<td colSpan={columns.length} className="bg-muted/20 px-3 py-3 text-sm">
												<p className="mb-1.5 font-medium text-muted-foreground text-xs">Books</p>
												{books.filter((b) => b.userId === u.id).length === 0 ? (
													<p className="text-muted-foreground text-xs">No books.</p>
												) : (
													<ul className="space-y-0.5">
														{books
															.filter((b) => b.userId === u.id)
															.map((b) => (
																<li key={b.bookId} className="text-xs">
																	{b.title}
																	{b.author ? ` - ${b.author}` : ""}
																	{b.fileSize ? ` (${formatBytes(b.fileSize)})` : ""}
																</li>
															))}
													</ul>
												)}
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

	const [expanded, setExpanded] = React.useState<string | null>(null);
	const [confirming, setConfirming] = React.useState<string | null>(null);
	const [pending, setPending] = React.useState(false);
	const [filter, setFilter] = React.useState("all");

	const filtered = filter === "all" ? books : books.filter((b) => b.userId === filter);

	// Refs so column definitions stay stable while cells always read latest state.
	const stateRef = React.useRef({ expanded, confirming, pending });
	stateRef.current = { expanded, confirming, pending };

	async function handleDelete(userId: string, bookId: string) {
		setPending(true);
		try {
			await deleteAdminBook({ data: { userId, bookId } });
			await qc.invalidateQueries({ queryKey: adminKeys.books });
			setConfirming(null);
			const key = bookKey({ userId, bookId });
			if (stateRef.current.expanded === key) setExpanded(null);
		} finally {
			setPending(false);
		}
	}

	const handleDeleteRef = React.useRef(handleDelete);
	handleDeleteRef.current = handleDelete;

	const columns = React.useMemo<ColumnDef<AdminBook>[]>(
		() => [
			{
				id: "title",
				header: "Title",
				cell: ({ row }) => {
					const b = row.original;
					return (
						<div>
							<div className="font-medium">{b.title}</div>
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
					const { expanded, confirming, pending } = stateRef.current;
					return (
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setExpanded(expanded === key ? null : key)}
							>
								{expanded === key ? "Hide" : "Details"}
							</Button>
							{confirming === key ? (
								<>
									<Button
										variant="destructive"
										size="sm"
										disabled={pending}
										onClick={() => handleDeleteRef.current(b.userId, b.bookId)}
									>
										Confirm
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={pending}
										onClick={() => setConfirming(null)}
									>
										Cancel
									</Button>
								</>
							) : (
								<Button variant="outline" size="sm" onClick={() => setConfirming(key)}>
									Delete
								</Button>
							)}
						</div>
					);
				},
			},
		],
		[], // stable - state is read via stateRef.current at render time
	);

	const table = useReactTable({
		data: filtered,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 20 } },
	});

	const { pageIndex } = table.getState().pagination;

	const filterControl = (
		<div className="flex items-center gap-2">
			<label htmlFor="filter-user" className="text-muted-foreground text-xs">
				Filter by user
			</label>
			<select
				id="filter-user"
				value={filter}
				onChange={(e) => {
					setFilter(e.target.value);
					table.setPageIndex(0);
				}}
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
	);

	if (isLoading)
		return (
			<>
				{filterControl}
				<p className="text-muted-foreground text-sm">Loading…</p>
			</>
		);
	if (filtered.length === 0)
		return (
			<>
				{filterControl}
				<p className="text-muted-foreground text-sm">No books.</p>
			</>
		);

	return (
		<div className="space-y-3">
			{filterControl}
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
								const b = row.original;
								const key = bookKey(b);
								const progress =
									b.fileSize && b.position ? Math.round((b.position / b.fileSize) * 100) : 0;
								return (
									<React.Fragment key={key}>
										<tr className="border-b last:border-0">
											{row.getVisibleCells().map((cell) => (
												<td key={cell.id} className="py-2 pr-4 last:pr-0">
													{flexRender(cell.column.columnDef.cell, cell.getContext())}
												</td>
											))}
										</tr>
										{expanded === key && (
											<tr>
												<td colSpan={columns.length} className="bg-muted/20 px-3 py-3">
													<dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
														<div>
															<dt className="text-muted-foreground">Words</dt>
															<dd className="tabular-nums">
																{b.wordCount?.toLocaleString() ?? "-"}
															</dd>
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
		</div>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AdminPage() {
	const {
		userTotal,
		usersLast7d,
		usersLast30d,
		bookTotal,
		storageTotalBytes,
		usersWithBooks,
		highlightTotal,
		activeSessions,
	} = Route.useLoaderData();

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
			<h1 className="mb-6 font-bold text-3xl tracking-tight">Admin</h1>
			<div className="space-y-8">
				<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatCard icon={Users} label="Total Users" value={userTotal} />
					<StatCard icon={BookOpen} label="Books" value={bookTotal} />
					<StatCard icon={HardDrive} label="Storage" value={formatBytes(storageTotalBytes)} />
					<StatCard icon={Activity} label="Active Sessions" value={activeSessions} />
					<StatCard icon={UserPlus} label="New (7d)" value={usersLast7d} />
					<StatCard icon={UserPlus} label="New (30d)" value={usersLast30d} />
					<StatCard icon={Library} label="Users with books" value={usersWithBooks} />
					<StatCard icon={Highlighter} label="Highlights" value={highlightTotal} />
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
			</div>
		</div>
	);
}
