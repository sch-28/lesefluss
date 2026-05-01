import { IonIcon } from "@ionic/react";
import { motion } from "framer-motion";
import { bookOutline } from "ionicons/icons";

export function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center px-8 py-24 text-center">
			<motion.div
				animate={{
					scale: [1, 1.08, 1],
					opacity: [0.6, 0.9, 0.6],
				}}
				transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-current/5"
			>
				<IonIcon icon={bookOutline} className="text-4xl opacity-70" />
			</motion.div>
			<h2 className="mb-2 font-semibold text-lg">No stats yet</h2>
			<p className="max-w-xs text-sm opacity-70">
				Read a book to start tracking your time, words, and streak.
			</p>
		</div>
	);
}
