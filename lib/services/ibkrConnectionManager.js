// lib/services/ibkrConnectionManager.js
// IBKR Connection Manager - Handles automatic reconnection and connection monitoring

import { checkConnection, keepAlive } from './ibkrService.js';

class IBKRConnectionManager {
  constructor(config = {}) {
    this.config = {
      keepAliveInterval: config.keepAliveInterval || 60000, // 1 minute
      reconnectInterval: config.reconnectInterval || 30000, // 30 seconds
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      onConnectionChange: config.onConnectionChange || (() => {}),
      onError: config.onError || console.error
    };
    
    this.connectionStatus = {
      connected: false,
      authenticated: false,
      competing: false,
      serverName: null,
      lastCheck: null,
      reconnectAttempts: 0,
      streams: {}
    };
    
    this.keepAliveTimer = null;
    this.reconnectTimer = null;
    this.isRunning = false;
  }

  // Start the connection manager
  async start() {
    if (this.isRunning) {
      console.log('Connection manager already running');
      return;
    }
    
    this.isRunning = true;
    console.log('Starting IBKR Connection Manager');
    
    // Initial connection check
    await this.checkConnectionStatus();
    
    // Start keep-alive timer
    this.startKeepAlive();
    
    // Start reconnection monitor
    this.startReconnectMonitor();
    
    return this.connectionStatus;
  }

  // Stop the connection manager
  stop() {
    this.isRunning = false;
    
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    console.log('IBKR Connection Manager stopped');
  }

  // Check current connection status
  async checkConnectionStatus() {
    try {
      const status = await checkConnection();
      const previousStatus = { ...this.connectionStatus };
      
      this.connectionStatus = {
        ...status,
        lastCheck: Date.now(),
        reconnectAttempts: status.connected ? 0 : this.connectionStatus.reconnectAttempts
      };
      
      // Notify if connection status changed
      if (previousStatus.connected !== status.connected ||
          previousStatus.authenticated !== status.authenticated) {
        this.config.onConnectionChange(this.connectionStatus, previousStatus);
        
        if (status.connected && status.authenticated) {
          console.log('IBKR connection established and authenticated');
          this.connectionStatus.reconnectAttempts = 0;
        } else if (!status.connected) {
          console.log('IBKR connection lost, will attempt reconnection');
        } else if (!status.authenticated) {
          console.log('IBKR connected but not authenticated');
        }
      }
      
      return this.connectionStatus;
    } catch (error) {
      this.config.onError('Connection check failed:', error);
      this.connectionStatus.connected = false;
      this.connectionStatus.authenticated = false;
      this.connectionStatus.lastCheck = Date.now();
      return this.connectionStatus;
    }
  }

  // Start keep-alive timer
  startKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    
    this.keepAliveTimer = setInterval(async () => {
      if (this.connectionStatus.connected && this.connectionStatus.authenticated) {
        try {
          const success = await keepAlive();
          if (!success) {
            console.log('Keep-alive failed, checking connection');
            await this.checkConnectionStatus();
          }
        } catch (error) {
          this.config.onError('Keep-alive error:', error);
          await this.checkConnectionStatus();
        }
      }
    }, this.config.keepAliveInterval);
  }

  // Start reconnection monitor
  startReconnectMonitor() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }
    
    this.reconnectTimer = setInterval(async () => {
      if (!this.connectionStatus.connected || !this.connectionStatus.authenticated) {
        if (this.connectionStatus.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.connectionStatus.reconnectAttempts++;
          console.log(`Reconnection attempt ${this.connectionStatus.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
          
          await this.checkConnectionStatus();
          
          if (this.connectionStatus.connected && this.connectionStatus.authenticated) {
            console.log('Reconnection successful');
            this.connectionStatus.reconnectAttempts = 0;
          }
        } else {
          console.error('Max reconnection attempts reached. Manual intervention required.');
          // Stop trying to reconnect
          clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      }
    }, this.config.reconnectInterval);
  }

  // Get current status
  getStatus() {
    return {
      ...this.connectionStatus,
      isRunning: this.isRunning,
      timeSinceLastCheck: this.connectionStatus.lastCheck 
        ? Date.now() - this.connectionStatus.lastCheck 
        : null
    };
  }

  // Force reconnection
  async forceReconnect() {
    console.log('Forcing reconnection...');
    this.connectionStatus.reconnectAttempts = 0;
    
    // Restart reconnection monitor if it was stopped
    if (!this.reconnectTimer && this.isRunning) {
      this.startReconnectMonitor();
    }
    
    return await this.checkConnectionStatus();
  }

  // Check if specific stream is connected
  isStreamConnected(streamName) {
    return this.connectionStatus.streams?.[streamName]?.connected || false;
  }

  // Wait for connection (with timeout)
  async waitForConnection(timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.connectionStatus.connected && this.connectionStatus.authenticated) {
        return true;
      }
      
      // Check every second
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.checkConnectionStatus();
    }
    
    return false;
  }
}

// Singleton instance
let managerInstance = null;

// Get or create manager instance
export function getConnectionManager(config = {}) {
  if (!managerInstance) {
    managerInstance = new IBKRConnectionManager(config);
  }
  return managerInstance;
}

// Export the class for direct instantiation if needed
export default IBKRConnectionManager;

// Convenience functions
export async function ensureConnection() {
  const manager = getConnectionManager();
  
  if (!manager.isRunning) {
    await manager.start();
  }
  
  const status = manager.getStatus();
  
  if (!status.connected || !status.authenticated) {
    console.log('Waiting for IBKR connection...');
    const connected = await manager.waitForConnection();
    
    if (!connected) {
      throw new Error('Failed to establish IBKR connection');
    }
  }
  
  return status;
}

export async function monitorConnection(callback) {
  const manager = getConnectionManager({
    onConnectionChange: callback
  });
  
  if (!manager.isRunning) {
    await manager.start();
  }
  
  return manager;
}
