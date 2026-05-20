import { Button } from "@lesefluss/ui/button";
import type React from "react";

interface Props {
	onNext: () => void;
	onSkip: () => void;
}

const WelcomeStep: React.FC<Props> = ({ onNext, onSkip }) => {
	return (
		<div className="flex flex-col items-center text-center">
			<img src="/logo.svg" alt="" width={72} height={72} className="mb-6 size-18" />
			<h1 className="font-semibold text-4xl tracking-tight">Lesefluss</h1>
			<p className="mt-2 text-muted-foreground text-lg">Read faster, one word at a time.</p>
			<p className="mt-8 max-w-sm text-foreground/80 leading-relaxed">
				Welcome. Let's set up a few things so your first read feels right. It only takes a moment.
			</p>
			<div className="mt-10 flex w-full max-w-xs flex-col gap-3">
				<Button size="lg" onClick={onNext}>
					Get started
				</Button>
				<Button size="lg" variant="outline" onClick={onSkip}>
					Skip
				</Button>
			</div>
		</div>
	);
};

export default WelcomeStep;
