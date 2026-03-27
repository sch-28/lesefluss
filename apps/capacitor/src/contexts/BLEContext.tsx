import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BleDevice } from '@capacitor-community/bluetooth-le';
import { bleService, ScannedDevice } from '../services/ble';
import { BLEConnectionState } from '../constants/ble';
import { db, RSVPSettings } from '../services/database';

interface BLEContextType {
  // Connection state
  isConnected: boolean;
  connectionState: BLEConnectionState;
  connectedDevice: BleDevice | null;
  
  // Scanning state
  isScanning: boolean;
  scannedDevices: ScannedDevice[];
  
  // Operations
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connect: (deviceId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  syncToDevice: (settings: Partial<RSVPSettings>) => Promise<boolean>;
  syncFromDevice: () => Promise<RSVPSettings | null>;
  
  // Error state
  error: string | null;
  clearError: () => void;
}

const BLEContext = createContext<BLEContextType | undefined>(undefined);

export const useBLE = () => {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error('useBLE must be used within BLEProvider');
  }
  return context;
};

interface BLEProviderProps {
  children: ReactNode;
}

export const BLEProvider: React.FC<BLEProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<BLEConnectionState>(
    BLEConnectionState.DISCONNECTED
  );
  const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize BLE on mount
  useEffect(() => {
    const init = async () => {
      const result = await bleService.initialize();
      if (!result.success) {
        setError(result.error || 'Failed to initialize BLE');
      }
    };
    init();
  }, []);

  // Poll connection state
  useEffect(() => {
    const interval = setInterval(() => {
      const state = bleService.getConnectionState();
      const device = bleService.getConnectedDevice();
      
      setConnectionState(state);
      setIsConnected(state === BLEConnectionState.CONNECTED);
      setConnectedDevice(device);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const startScan = async () => {
    setError(null);
    setScannedDevices([]);
    setIsScanning(true);

    const result = await bleService.startScan((devices) => {
      setScannedDevices(devices);
    });

    if (!result.success) {
      setError(result.error || 'Failed to start scan');
      setIsScanning(false);
    }
  };

  const stopScan = async () => {
    const result = await bleService.stopScan();
    setIsScanning(false);

    if (!result.success) {
      setError(result.error || 'Failed to stop scan');
    }
  };

  const connect = async (deviceId: string): Promise<boolean> => {
    setError(null);

    const result = await bleService.connect(deviceId);

    if (result.success && result.data) {
      setConnectedDevice(result.data);
      setConnectionState(BLEConnectionState.CONNECTED);
      setIsConnected(true);

      // Save device to database
      try {
        await db.saveDevice({
          id: result.data.deviceId,
          name: result.data.name || 'RSVP-Reader',
          lastConnected: Date.now(),
        });
      } catch (err) {
        console.error('Failed to save device to database:', err);
      }

      return true;
    } else {
      setError(result.error || 'Failed to connect');
      return false;
    }
  };

  const disconnect = async () => {
    setError(null);

    const result = await bleService.disconnect();

    if (!result.success) {
      setError(result.error || 'Failed to disconnect');
    }

    setIsConnected(false);
    setConnectedDevice(null);
    setConnectionState(BLEConnectionState.DISCONNECTED);
  };

  const syncToDevice = async (settings: Partial<RSVPSettings>): Promise<boolean> => {
    setError(null);

    if (!isConnected) {
      setError('Not connected to device');
      return false;
    }

    const result = await bleService.writeSettings(settings);

    if (!result.success) {
      setError(result.error || 'Failed to sync settings to device');
      return false;
    }

    return true;
  };

  const syncFromDevice = async (): Promise<RSVPSettings | null> => {
    setError(null);

    if (!isConnected) {
      setError('Not connected to device');
      return null;
    }

    const result = await bleService.readSettings();

    if (!result.success || !result.data) {
      setError(result.error || 'Failed to read settings from device');
      return null;
    }

    // Merge with current settings (preserve ID and updatedAt)
    try {
      const currentSettings = await db.getSettings();
      const mergedSettings: RSVPSettings = {
        ...currentSettings,
        ...result.data,
      };
      return mergedSettings;
    } catch (err) {
      console.error('Failed to merge settings:', err);
      setError('Failed to process settings from device');
      return null;
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value: BLEContextType = {
    isConnected,
    connectionState,
    connectedDevice,
    isScanning,
    scannedDevices,
    startScan,
    stopScan,
    connect,
    disconnect,
    syncToDevice,
    syncFromDevice,
    error,
    clearError,
  };

  return <BLEContext.Provider value={value}>{children}</BLEContext.Provider>;
};
