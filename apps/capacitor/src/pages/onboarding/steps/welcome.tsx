import type React from "react";
import { useEffect } from "react";
import { useOnboardingFooter } from "../footer-context";

const WelcomeStep: React.FC = () => {
	const { next, setFooter } = useOnboardingFooter();

	useEffect(() => {
		setFooter({ primary: { label: "Get started", onClick: next } });
	}, [next, setFooter]);

	return (
		<div className="flex flex-col items-center text-center">
			<img src="/logo.svg" alt="" width={72} height={72} className="mb-6 size-18" />
			<h1 className="font-semibold text-4xl tracking-tight">Lesefluss</h1>
			<p className="mt-2 text-lg text-muted-foreground">Read faster, one word at a time.</p>
			<p className="mt-8 max-w-sm text-foreground/80 leading-relaxed">
				Welcome. Let's set up a few things so your first read feels right. It only takes a moment.
			</p>
		</div>
	);
};

export default WelcomeStep;
