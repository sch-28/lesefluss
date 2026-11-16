import { useOverlayBack } from "@lesefluss/ui/overlay-back";
import React from "react";

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

type SelectProps = {
	value?: string;
	onValueChange?: (value: string) => void;
	children?: React.ReactNode;
};
type Slot = React.ReactElement<{ children?: React.ReactNode; "aria-label"?: string }>;
/** Distinct functions, since `Select` tells its slots apart by type. */
const unrendered = () => (_: { children?: React.ReactNode; "aria-label"?: string }) => null;

/** The app's Radix select as a native `<select>`: happy-dom cannot open Radix's portal. */
export const selectModule = {
	Select: ({ value, onValueChange, children }: SelectProps) => {
		const slots = React.Children.toArray(children) as Slot[];
		const trigger = slots.find((c) => c.type === selectModule.SelectTrigger);
		const content = slots.find((c) => c.type === selectModule.SelectContent);
		return (
			<select
				aria-label={trigger?.props["aria-label"]}
				value={value ?? ""}
				onChange={(e) => onValueChange?.(e.target.value)}
			>
				<option value="" />
				{content?.props.children}
			</select>
		);
	},
	SelectTrigger: unrendered(),
	SelectContent: unrendered(),
	SelectValue: unrendered(),
	SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
		<option value={value}>{children}</option>
	),
};
