import { Input, InputHitArea } from "@lesefluss/ui/input";
import { STAR_POSITIONS, StarGlyph } from "@lesefluss/ui/rating-stars";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@lesefluss/ui/select";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import {
	CONDITION_FIELDS,
	type FieldSpec,
	fieldSpec,
	isConditionComplete,
	operatorSpec,
	withField,
	withOperator,
} from "./condition-fields";
import type { Condition } from "./condition-tree";
import type { FacetOptions } from "./filter-picker";

type Choice = { value: string; label: string };

/** The app's own select, so a row reads the same in every theme and opens at its field. */
const ChoiceSelect: React.FC<{
	label: string;
	value: string;
	choices: readonly Choice[];
	onChange: (value: string) => void;
	placeholder?: string;
}> = ({ label, value, choices, onChange, placeholder }) => (
	<Select value={value === "" ? undefined : value} onValueChange={onChange}>
		<SelectTrigger aria-label={label} className="min-w-0 px-2">
			<SelectValue placeholder={placeholder} />
		</SelectTrigger>
		<SelectContent>
			{choices.map((c) => (
				<SelectItem key={c.value} value={c.value}>
					{c.label}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
);

const FIELD_CHOICES: Choice[] = CONDITION_FIELDS.map((f) => ({ value: f.field, label: f.label }));

const numberOrNull = (text: string): number | null => {
	if (text.trim() === "") return null;
	const n = Number(text);
	return Number.isFinite(n) ? n : null;
};

const NumberInput: React.FC<{
	value: unknown;
	onChange: (value: number | null) => void;
	label: string;
	unit?: string;
}> = ({ value, onChange, label, unit }) => (
	<span className="flex min-w-0 flex-1 items-center gap-1.5">
		<InputHitArea className="min-w-0 flex-1">
			<Input
				type="number"
				inputMode="numeric"
				min={0}
				aria-label={label}
				value={typeof value === "number" ? value : ""}
				onChange={(e) => onChange(numberOrNull(e.target.value))}
			/>
		</InputHitArea>
		{unit && <span className="shrink-0 text-muted-foreground text-xs">{unit}</span>}
	</span>
);

const StarPicker: React.FC<{ value: unknown; onChange: (stars: number) => void }> = ({
	value,
	onChange,
}) => {
	const stars = typeof value === "number" ? value : 0;
	return (
		<span className="flex items-center gap-0.5">
			{STAR_POSITIONS.map((star) => (
				<button
					key={star}
					type="button"
					aria-label={star === 1 ? "1 star" : `${star} stars`}
					aria-pressed={star === stars}
					onClick={() => onChange(star)}
					className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
				>
					<StarGlyph fill={star <= stars ? 2 : 0} className="size-4" />
				</button>
			))}
		</span>
	);
};

const PickValue: React.FC<{
	spec: FieldSpec;
	value: unknown;
	options: FacetOptions;
	onChange: (value: string) => void;
}> = ({ spec, value, options, onChange }) => {
	const choices = spec.facet ? options[spec.facet] : [];
	const current = typeof value === "string" ? value : "";
	// A value no book carries any more (a tag's last book edited) stays selectable.
	const isMissing = current !== "" && !choices.some((c) => c.value === current);
	return (
		<ChoiceSelect
			label={`${spec.label} value`}
			value={current}
			placeholder="Choose…"
			choices={isMissing ? [{ value: current, label: current }, ...choices] : choices}
			onChange={onChange}
		/>
	);
};

const ValueInput: React.FC<{
	cond: Condition;
	spec: FieldSpec;
	options: FacetOptions;
	onChange: (value: unknown) => void;
}> = ({ cond, spec, options, onChange }) => {
	const kind = operatorSpec(cond.field, cond.op)?.kind;
	const label = `${spec.label} value`;
	switch (kind) {
		case "pick":
			return <PickValue spec={spec} value={cond.value} options={options} onChange={onChange} />;
		case "text":
			return (
				<InputHitArea className="min-w-0">
					<Input
						aria-label={label}
						placeholder="Text"
						value={typeof cond.value === "string" ? cond.value : ""}
						onChange={(e) => onChange(e.target.value)}
					/>
				</InputHitArea>
			);
		case "number":
			return <NumberInput value={cond.value} onChange={onChange} label={label} unit={spec.unit} />;
		case "stars":
			return <StarPicker value={cond.value} onChange={onChange} />;
		case "days":
			return <NumberInput value={cond.value} onChange={onChange} label={label} unit="days" />;
		case "date":
			return (
				<InputHitArea className="min-w-0">
					<Input
						type="date"
						aria-label={label}
						value={typeof cond.value === "string" ? cond.value : ""}
						onChange={(e) => onChange(e.target.value)}
					/>
				</InputHitArea>
			);
		case "range": {
			const range = (cond.value ?? {}) as { min?: unknown; max?: unknown };
			const set = (bound: "min" | "max", n: number | null) =>
				onChange({ min: range.min ?? null, max: range.max ?? null, [bound]: n });
			return (
				<span className="flex min-w-0 items-center gap-1.5">
					<NumberInput value={range.min} onChange={(n) => set("min", n)} label={`${label} from`} />
					<span className="shrink-0 text-muted-foreground text-xs">and</span>
					<NumberInput
						value={range.max}
						onChange={(n) => set("max", n)}
						label={`${label} to`}
						unit={spec.unit}
					/>
				</span>
			);
		}
		default:
			return <span />;
	}
};

type Props = {
	cond: Condition;
	options: FacetOptions;
	onChange: (cond: Condition) => void;
	/** Leads the row: the drag handle on desktop. */
	leading?: React.ReactNode;
	/** Ends the row: remove, or the move menu. */
	trailing: React.ReactNode;
	/** The phone's stacked card instead of the desktop grid row. */
	isStacked?: boolean;
	/** A row just added and not yet filled in: no error outline before any input. */
	isUntouched?: boolean;
};

/** One condition: field, operator, value. An incomplete one, once touched, is outlined, as it blocks Save. */
export const ConditionRow: React.FC<Props> = ({
	cond,
	options,
	onChange,
	leading,
	trailing,
	isStacked = false,
	isUntouched = false,
}) => {
	const spec = fieldSpec(cond.field);
	const isIncomplete = !isConditionComplete(cond);
	const frame = cn(
		"rounded-lg",
		isIncomplete &&
			!isUntouched &&
			"outline-dashed outline-1 outline-destructive/70 outline-offset-2",
	);

	if (!spec || !operatorSpec(cond.field, cond.op)) {
		return (
			<div className={cn(frame, "flex items-center gap-2")} data-testid="condition-row">
				{leading}
				<span className="flex-1 text-muted-foreground text-sm">
					A condition this version cannot show. It is kept as it is.
				</span>
				{trailing}
			</div>
		);
	}

	const fieldSelect = (
		<ChoiceSelect
			label="Field"
			value={cond.field}
			choices={FIELD_CHOICES}
			onChange={(field) => onChange(withField(field))}
		/>
	);
	const opSelect = (
		<ChoiceSelect
			label="Operator"
			value={cond.op}
			choices={spec.ops.map((o) => ({ value: o.op, label: o.label }))}
			onChange={(op) => onChange(withOperator(cond, op))}
		/>
	);
	const value = (
		<ValueInput
			cond={cond}
			spec={spec}
			options={options}
			onChange={(v) => onChange({ ...cond, value: v })}
		/>
	);

	if (isStacked) {
		return (
			<div
				className={cn(frame, "flex flex-col gap-2 border border-border bg-card p-2.5")}
				data-testid="condition-row"
				data-incomplete={isIncomplete || undefined}
			>
				<div className="flex items-center gap-2">
					{fieldSelect}
					{opSelect}
					{trailing}
				</div>
				{value}
			</div>
		);
	}

	return (
		<div
			className={cn(
				frame,
				"grid grid-cols-[auto_minmax(0,9rem)_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2",
			)}
			data-testid="condition-row"
			data-incomplete={isIncomplete || undefined}
		>
			{leading ?? <span />}
			{fieldSelect}
			{opSelect}
			{value}
			{trailing}
		</div>
	);
};
