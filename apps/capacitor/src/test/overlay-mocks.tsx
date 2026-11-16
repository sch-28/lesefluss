import { useOverlayBack } from "@lesefluss/ui/overlay-back";
import type React from "react";

type OverlayProps = {
	open: boolean;
	onOpenChange?: (open: boolean) => void;
	dismissible?: boolean;
	dismissable?: boolean;
	children?: React.ReactNode;
};

/**
 * Stands in for an overlay root in happy-dom, keeping the real Android back
 * registration so a test still sees which overlay a press closes.
 */
export function MockOverlay({
	testId,
	className,
	...p
}: OverlayProps & { testId?: string; className?: string }) {
	useOverlayBack(p.open, () => p.onOpenChange?.(false), p.dismissible ?? p.dismissable ?? true);
	return p.open ? (
		<div data-testid={testId} className={className}>
			{p.children}
		</div>
	) : null;
}

const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

export const drawerModule = {
	Drawer: (p: OverlayProps) => <MockOverlay testId="sheet" {...p} />,
	DrawerContent: Pass,
	DrawerHeader: Pass,
	DrawerTitle: Pass,
	DrawerDescription: Pass,
};
