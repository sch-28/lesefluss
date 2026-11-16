import { Button } from "@lesefluss/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { EmptyState as SharedEmptyState } from "../../../components/empty-state";

function PulsingBook({ className }: { className?: string }) {
	return (
		<motion.div
			animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
			transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
		>
			<BookOpen className={className} />
		</motion.div>
	);
}

/** `page` false when something sits above it; the caller then gives it the free height. */
export function EmptyState({ page = true, className }: { page?: boolean; className?: string }) {
	const navigate = useNavigate();
	return (
		<SharedEmptyState
			icon={PulsingBook}
			title="No stats yet"
			page={page}
			className={className}
			action={
				<Button variant="outline" onClick={() => navigate({ to: "/tabs/library" })}>
					Open library
				</Button>
			}
		>
			Read a book to start tracking your time, words, and streak.
		</SharedEmptyState>
	);
}
