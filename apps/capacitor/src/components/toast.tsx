import { useIonToast } from "@ionic/react";

export function useToast() {
	const [presentToast] = useIonToast();

	const showToast = (message: string, color: "success" | "danger" | "warning" = "success") => {
		presentToast({ message, color, duration: 2500, position: "top" });
	};

	return { showToast };
}
