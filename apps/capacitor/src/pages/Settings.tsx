import React, { useState, useEffect } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonRange,
  IonToggle,
  IonButton,
  IonNote,
  IonListHeader,
  IonToast,
  IonSpinner,
  IonIcon,
  IonText,
} from '@ionic/react';
import { cloudDownload, cloudUpload, bluetooth } from 'ionicons/icons';
import { db, RSVPSettings } from '../services/database';
import { useDatabase } from '../contexts/DatabaseContext';
import { useBLE } from '../contexts/BLEContext';
import { SETTING_CONSTRAINTS } from '../constants/settings';

const Settings: React.FC = () => {
  const { isReady } = useDatabase();
  const { isConnected, syncToDevice, syncFromDevice, error: bleError } = useBLE();
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; color?: string }>({
    show: false,
    message: '',
  });

  const [settings, setSettings] = useState<RSVPSettings | null>(null);

  // Load settings from database on mount
  useEffect(() => {
    if (isReady) {
      loadSettings();
    }
  }, [isReady]);

  const loadSettings = async () => {
    try {
      const dbSettings = await db.getSettings();
      setSettings(dbSettings);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setToast({
        show: true,
        message: 'Failed to load settings',
        color: 'danger',
      });
      setLoading(false);
    }
  };

  const updateSetting = <K extends keyof RSVPSettings>(
    key: K,
    value: RSVPSettings[K]
  ) => {
    if (!settings) return;
    setSettings((prev) => ({ ...prev!, [key]: value }));
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      const { id, updatedAt, ...settingsToSave } = settings;
      await db.saveSettings(settingsToSave);
      setToast({
        show: true,
        message: 'Settings saved',
        color: 'success',
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setToast({
        show: true,
        message: 'Failed to save settings',
        color: 'danger',
      });
    }
  };

  const handleSyncToDevice = async () => {
    if (!isConnected) {
      setToast({
        show: true,
        message: 'Not connected to device. Please connect first.',
        color: 'warning',
      });
      return;
    }

    if (!settings) return;

    try {
      setSyncing(true);

      // Save to database first
      await handleSave();

      // Sync to device
      const { id, updatedAt, ...settingsToSync } = settings;
      const success = await syncToDevice(settingsToSync);

      if (success) {
        setToast({
          show: true,
          message: 'Settings synced to device successfully',
          color: 'success',
        });
      } else {
        setToast({
          show: true,
          message: bleError || 'Failed to sync settings to device',
          color: 'danger',
        });
      }
    } catch (error) {
      console.error('Failed to sync to device:', error);
      setToast({
        show: true,
        message: 'Failed to sync settings to device',
        color: 'danger',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncFromDevice = async () => {
    if (!isConnected) {
      setToast({
        show: true,
        message: 'Not connected to device. Please connect first.',
        color: 'warning',
      });
      return;
    }

    try {
      setSyncing(true);

      // Read from device
      const deviceSettings = await syncFromDevice();

      if (deviceSettings) {
        // Update local state
        setSettings(deviceSettings);

        // Save to database
        const { id, updatedAt, ...settingsToSave } = deviceSettings;
        await db.saveSettings(settingsToSave);

        setToast({
          show: true,
          message: 'Settings loaded from device successfully',
          color: 'success',
        });
      } else {
        setToast({
          show: true,
          message: bleError || 'Failed to load settings from device',
          color: 'danger',
        });
      }
    } catch (error) {
      console.error('Failed to sync from device:', error);
      setToast({
        show: true,
        message: 'Failed to load settings from device',
        color: 'danger',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading || !settings) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>RSVP Settings</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
          <p>Loading settings...</p>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>RSVP Settings</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonList>
          <IonListHeader>
            <IonLabel>Reading Speed</IonLabel>
          </IonListHeader>

          <IonItem>
            <IonLabel position="stacked">
              Words Per Minute: {settings.wpm}
            </IonLabel>
            <IonRange
              min={SETTING_CONSTRAINTS.WPM.min}
              max={SETTING_CONSTRAINTS.WPM.max}
              step={SETTING_CONSTRAINTS.WPM.step}
              value={settings.wpm}
              onIonChange={(e) => updateSetting('wpm', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => `${value} WPM`}
            />
          </IonItem>

          <IonListHeader>
            <IonLabel>Punctuation Delays</IonLabel>
          </IonListHeader>

          <IonItem>
            <IonLabel position="stacked">
              Comma Delay: {settings.delayComma.toFixed(1)}x
              <IonNote>For , ; :</IonNote>
            </IonLabel>
            <IonRange
              min={1.0}
              max={5.0}
              step={0.1}
              value={settings.delayComma}
              onIonChange={(e) => updateSetting('delayComma', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => `${value.toFixed(1)}x`}
            />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">
              Period Delay: {settings.delayPeriod.toFixed(1)}x
              <IonNote>For . ! ?</IonNote>
            </IonLabel>
            <IonRange
              min={1.0}
              max={5.0}
              step={0.1}
              value={settings.delayPeriod}
              onIonChange={(e) => updateSetting('delayPeriod', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => `${value.toFixed(1)}x`}
            />
          </IonItem>

          <IonListHeader>
            <IonLabel>Acceleration</IonLabel>
          </IonListHeader>

          <IonItem>
            <IonLabel position="stacked">
              Start Speed: {settings.accelStart.toFixed(1)}x
              <IonNote>Initial speed multiplier (ease-in)</IonNote>
            </IonLabel>
            <IonRange
              min={1.0}
              max={5.0}
              step={0.1}
              value={settings.accelStart}
              onIonChange={(e) => updateSetting('accelStart', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => `${value.toFixed(1)}x`}
            />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">
              Acceleration Rate: {settings.accelRate.toFixed(2)}
              <IonNote>How fast to reach full speed</IonNote>
            </IonLabel>
            <IonRange
              min={0.05}
              max={1.0}
              step={0.05}
              value={settings.accelRate}
              onIonChange={(e) => updateSetting('accelRate', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => value.toFixed(2)}
            />
          </IonItem>

          <IonListHeader>
            <IonLabel>Display</IonLabel>
          </IonListHeader>

          <IonItem>
            <IonLabel position="stacked">
              Focal Offset: {settings.xOffset}%
              <IonNote>Horizontal position (30=left, 50=center, 70=right)</IonNote>
            </IonLabel>
            <IonRange
              min={30}
              max={70}
              step={5}
              value={settings.xOffset}
              onIonChange={(e) => updateSetting('xOffset', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => `${value}%`}
            />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">
              Word Offset: {settings.wordOffset}
              <IonNote>Words to rewind when resuming</IonNote>
            </IonLabel>
            <IonRange
              min={0}
              max={20}
              step={1}
              value={settings.wordOffset}
              onIonChange={(e) => updateSetting('wordOffset', e.detail.value as number)}
              pin
              pinFormatter={(value: number) => `${value} words`}
            />
          </IonItem>

          <IonItem>
            <IonLabel>Inverse Colors</IonLabel>
            <IonToggle
              checked={settings.inverse}
              onIonChange={(e) => updateSetting('inverse', e.detail.checked)}
            />
          </IonItem>

          <IonListHeader>
            <IonLabel>Connection</IonLabel>
          </IonListHeader>

          <IonItem>
            <IonLabel>BLE Enabled</IonLabel>
            <IonToggle
              checked={settings.bleOn}
              onIonChange={(e) => updateSetting('bleOn', e.detail.checked)}
            />
          </IonItem>

          <IonListHeader>
            <IonLabel>Book Slot</IonLabel>
          </IonListHeader>

          <IonItem>
            <IonLabel position="stacked">
              Current Slot: {settings.currentSlot}
            </IonLabel>
            <IonRange
              min={1}
              max={4}
              step={1}
              value={settings.currentSlot}
              onIonChange={(e) => updateSetting('currentSlot', e.detail.value as number)}
              pin
              ticks
              snaps
            />
          </IonItem>
        </IonList>

        <div className="ion-padding">
          <IonButton expand="block" onClick={handleSave}>
            Save Settings
          </IonButton>
          
          {/* BLE Sync Section */}
          <IonList className="ion-margin-top">
            <IonListHeader>
              <IonLabel>Device Sync</IonLabel>
            </IonListHeader>
            
            {!isConnected && (
              <IonItem>
                <IonIcon icon={bluetooth} slot="start" color="medium" />
                <IonLabel>
                  <IonText color="medium">
                    <p>Connect to device on Home tab to sync settings</p>
                  </IonText>
                </IonLabel>
              </IonItem>
            )}
            
            <IonButton 
              expand="block" 
              fill="outline" 
              onClick={handleSyncToDevice}
              disabled={!isConnected || syncing}
            >
              {syncing ? (
                <IonSpinner name="crescent" slot="start" />
              ) : (
                <IonIcon slot="start" icon={cloudUpload} />
              )}
              Sync to Device
            </IonButton>
            
            <IonButton 
              expand="block" 
              fill="outline" 
              onClick={handleSyncFromDevice}
              disabled={!isConnected || syncing}
            >
              {syncing ? (
                <IonSpinner name="crescent" slot="start" />
              ) : (
                <IonIcon slot="start" icon={cloudDownload} />
              )}
              Load from Device
            </IonButton>
          </IonList>
        </div>

        <IonToast
          isOpen={toast.show}
          onDidDismiss={() => setToast({ show: false, message: '' })}
          message={toast.message}
          duration={2000}
          color={toast.color}
        />
      </IonContent>
    </IonPage>
  );
};

export default Settings;
