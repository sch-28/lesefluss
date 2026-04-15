import {
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonInput,
	IonItem,
	IonLabel,
	IonList,
	IonListHeader,
	IonPage,
	IonSpinner,
	IonText,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { cloudDone, cloudOutline, logOutOutline, syncOutline } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useSyncContext } from "../../contexts/sync-context";
import { IS_WEB_BUILD } from "../../services/sync";

function formatLastSynced(ms: number | null): string {
	if (!ms) return "Never";
	const diff = Date.now() - ms;
	if (diff < 60_000) return "Just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
	return new Date(ms).toLocaleString();
}

const SyncSettings: React.FC = () => {
	const {
		isLoggedIn,
		userEmail,
		isSyncing,
		lastSynced,
		syncError,
		login,
		register,
		logout,
		syncNow,
	} = useSyncContext();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [isSignUp, setIsSignUp] = useState(false);
	const [authError, setAuthError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const displayError = authError || syncError;

	const handleSubmit = async () => {
		setAuthError(null);
		setIsSubmitting(true);
		try {
			if (isSignUp) {
				await register(name, email, password);
			} else {
				await login(email, password);
			}
		} catch (err) {
			setAuthError(err instanceof Error ? err.message : "Authentication failed");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>Cloud Sync</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{isLoggedIn ? (
					<IonList className="content-container">
						<IonListHeader>
							<IonLabel>Account</IonLabel>
						</IonListHeader>
						<IonItem>
							<IonIcon icon={cloudDone} slot="start" color="success" />
							<IonLabel>
								<h2>{userEmail}</h2>
								<p>Last synced: {formatLastSynced(lastSynced)}</p>
							</IonLabel>
						</IonItem>

						{syncError && (
							<div className="ion-padding-horizontal ion-padding-top">
								<IonText color="danger">
									<p style={{ margin: 0, fontSize: "14px" }}>{syncError}</p>
								</IonText>
							</div>
						)}

						<div className="ion-padding">
							<IonButton expand="block" fill="outline" onClick={syncNow} disabled={isSyncing}>
								{isSyncing ? (
									<IonSpinner name="crescent" />
								) : (
									<IonIcon icon={syncOutline} slot="start" />
								)}
								{isSyncing ? "Syncing..." : "Sync Now"}
							</IonButton>
						</div>

						{!IS_WEB_BUILD && (
							<IonItem button onClick={logout} detail={false}>
								<IonIcon icon={logOutOutline} slot="start" color="danger" />
								<IonLabel color="danger">Sign Out</IonLabel>
							</IonItem>
						)}
					</IonList>
				) : IS_WEB_BUILD ? (
					<IonList className="content-container">
						<IonListHeader>
							<IonLabel>Not Signed In</IonLabel>
						</IonListHeader>
						<IonItem>
							<IonIcon icon={cloudOutline} slot="start" color="medium" />
							<IonLabel className="ion-text-wrap">
								<p>
									Sign in on the main website to sync your library, reading progress, and
									highlights.
								</p>
							</IonLabel>
						</IonItem>
						<div className="ion-padding">
							<IonButton expand="block" href="/login" target="_top">
								Sign In
							</IonButton>
						</div>
					</IonList>
				) : (
					<IonList className="content-container">
						<IonListHeader>
							<IonLabel>{isSignUp ? "Create Account" : "Sign In"}</IonLabel>
						</IonListHeader>
						<IonItem>
							<IonIcon icon={cloudOutline} slot="start" color="medium" />
							<IonLabel className="ion-text-wrap">
								<p>
									Sign in to sync your library, reading progress, and highlights across devices.
								</p>
							</IonLabel>
						</IonItem>

						{isSignUp && (
							<IonItem>
								<IonInput
									label="Name"
									labelPlacement="stacked"
									type="text"
									value={name}
									onIonInput={(e) => setName(e.detail.value ?? "")}
								/>
							</IonItem>
						)}
						<IonItem>
							<IonInput
								label="Email"
								labelPlacement="stacked"
								type="email"
								value={email}
								onIonInput={(e) => setEmail(e.detail.value ?? "")}
							/>
						</IonItem>
						<IonItem>
							<IonInput
								label="Password"
								labelPlacement="stacked"
								type="password"
								value={password}
								onIonInput={(e) => setPassword(e.detail.value ?? "")}
							/>
						</IonItem>

						{displayError && (
							<div className="ion-padding-horizontal ion-padding-top">
								<IonText color="danger">
									<p style={{ margin: 0, fontSize: "14px" }}>{displayError}</p>
								</IonText>
							</div>
						)}

						<div className="ion-padding">
							<IonButton
								expand="block"
								onClick={handleSubmit}
								disabled={isSubmitting || !email || !password || (isSignUp && !name)}
							>
								{isSubmitting ? <IonSpinner name="crescent" /> : isSignUp ? "Sign Up" : "Sign In"}
							</IonButton>
						</div>

						<IonItem button onClick={() => setIsSignUp(!isSignUp)} detail={false}>
							<IonLabel color="medium" className="ion-text-center">
								<p>{isSignUp ? "Already have an account? Sign in" : "No account? Sign up"}</p>
							</IonLabel>
						</IonItem>
					</IonList>
				)}
			</IonContent>
		</IonPage>
	);
};

export default SyncSettings;
