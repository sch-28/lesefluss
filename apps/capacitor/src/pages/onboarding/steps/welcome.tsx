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
			<img
				src={`${import.meta.env.BASE_URL}logo.svg`}
				alt=""
				width={72}
				height={72}
				className="mb-6 size-18"
			/>
			<h1 className="m-0 font-semibold text-4xl tracking-tight">Lesefluss</h1>
			<p className="m-0 mt-2 text-lg text-muted-foreground">
				Your books, read your way: pages, scrolling or one word at a time.
			</p>
			<p className="m-0 mt-6 max-w-sm text-foreground/80 leading-relaxed">
				Let's set up a few things so your first read feels right. It takes a minute.
			</p>
		</div>
	);
};

export default WelcomeStep;
