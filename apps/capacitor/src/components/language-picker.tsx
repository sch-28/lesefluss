import { Capacitor } from "@capacitor/core";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Check } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useMediaQuery } from "../hooks/use-media-query";
import { type LanguageOption, languageOption, searchLanguages } from "../utils/language-label";
import { PickerTrigger } from "./picker-trigger";

const COMMON = ["en", "de", "fr", "es", "it"];

type Props = {
	id?: string;
	value: string | null;
	onChange: (code: string | null) => void;
	/** The language the file declared, offered first. */
	fileLanguage?: string | null;
};

function baseCode(tag: string | null | undefined): string | null {
	return tag ? (tag.split(/[-_]/)[0]?.toLowerCase() ?? null) : null;
}

/** A sheet on phones and in the app, a popover on wide web, like EntryDialog. */
export const LanguagePicker: React.FC<Props> = ({ id, value, onChange, fileLanguage }) => {
	const isWideWeb = useMediaQuery("(min-width: 768px)") && !Capacitor.isNativePlatform();
	const [open, setOpen] = useState(false);

	const select = (code: string | null) => {
		onChange(code);
		setOpen(false);
	};

	const trigger = (
		<PickerTrigger
			id={id}
			onClick={isWideWeb ? undefined : () => setOpen(true)}
			value={value ? languageOption(value).name : null}
			placeholder="Not set"
			trailing={value && <span className="text-muted-foreground text-xs">{value}</span>}
		/>
	);

	const list = <LanguageList value={value} fileLanguage={fileLanguage ?? null} onSelect={select} />;

	if (isWideWeb) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				<PopoverContent align="start" className="w-80 p-0">
					<div className="px-3 pt-3">
						<p className="m-0 font-medium text-sm">Language</p>
						<p className="m-0 text-muted-foreground text-xs">Used for hyphenation and RSVP</p>
					</div>
					{list}
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<>
			{trigger}
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Language</DrawerTitle>
						<DrawerDescription>Used for hyphenation and RSVP</DrawerDescription>
					</DrawerHeader>
					{list}
				</DrawerContent>
			</Drawer>
		</>
	);
};

const LanguageList: React.FC<{
	value: string | null;
	fileLanguage: string | null;
	onSelect: (code: string | null) => void;
}> = ({ value, fileLanguage, onSelect }) => {
	const [query, setQuery] = useState("");
	const [showAll, setShowAll] = useState(false);

	const groups = useMemo(() => {
		if (query.trim()) return [{ label: "Results", options: searchLanguages(query) }];
		const fromFile = baseCode(fileLanguage);
		const browser = baseCode(typeof navigator === "undefined" ? null : navigator.language);
		const common = [...new Set([...(browser ? [browser] : []), ...COMMON])].filter(
			(code) => code !== fromFile,
		);
		const out: { label: string; options: LanguageOption[] }[] = [];
		if (fromFile) out.push({ label: "From the file", options: [languageOption(fromFile)] });
		// A stored tag outside the list ("pt-BR", "x-klingon") stays visible and selectable.
		if (value && value !== fromFile && !common.includes(value)) {
			out.push({ label: "Current", options: [languageOption(value)] });
		}
		out.push({ label: "Common", options: common.map(languageOption) });
		if (showAll) out.push({ label: "All languages", options: searchLanguages("") });
		return out;
	}, [query, fileLanguage, value, showAll]);

	return (
		<div className="flex flex-col gap-2 p-3">
			<Input
				aria-label="Search languages"
				placeholder="Search, e.g. Deutsch or de"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<div className="flex max-h-[50vh] flex-col overflow-y-auto">
				{groups.map((group) => (
					<div key={group.label} className="flex flex-col">
						<p className="m-0 px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs">
							{group.label}
						</p>
						{group.options.map((o) => (
							<LanguageRow
								key={`${group.label}-${o.code}`}
								option={o}
								selected={o.code === value}
								onSelect={() => onSelect(o.code)}
							/>
						))}
						{group.options.length === 0 && (
							<p className="m-0 px-2 py-2 text-muted-foreground text-sm">No language found</p>
						)}
					</div>
				))}
				{!query.trim() && !showAll && (
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className="rounded-md px-2 py-2 text-left text-primary text-sm hover:bg-muted"
					>
						All languages…
					</button>
				)}
				{value && (
					<button
						type="button"
						onClick={() => onSelect(null)}
						className="rounded-md px-2 py-2 text-left text-muted-foreground text-sm hover:bg-muted"
					>
						Not set
					</button>
				)}
			</div>
		</div>
	);
};

const LanguageRow: React.FC<{
	option: LanguageOption;
	selected: boolean;
	onSelect: () => void;
}> = ({ option, selected, onSelect }) => (
	<button
		type="button"
		onClick={onSelect}
		aria-pressed={selected}
		className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
	>
		<span className="flex-1 truncate">
			{option.native !== option.name ? `${option.native} · ${option.name}` : option.name}
		</span>
		<span className="text-muted-foreground text-xs">{option.code}</span>
		{selected && <Check className="size-4 text-primary" />}
	</button>
);
