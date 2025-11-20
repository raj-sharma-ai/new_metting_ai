const { BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { randomUUID } = require('crypto');

class AudioCapture {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.chunkDuration = options.chunkDuration || 10; // seconds
    this.recording = false;
    this.onChunkCallback = null;

    this.captureWindow = null;
    this.sessionId = null;
    this.ipcRegistered = false;
  }

  async ensureCaptureWindow() {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      // Wait for window to be ready
      await new Promise((resolve) => {
        if (this.captureWindow.webContents.isLoading()) {
          this.captureWindow.webContents.once('did-finish-load', resolve);
        } else {
          resolve();
        }
      });
      return;
    }

    this.captureWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/capture-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });

    await this.captureWindow.loadFile(path.join(__dirname, '../renderer/capture.html'));
    
    // Wait for window to be fully ready
    await new Promise((resolve) => {
      if (this.captureWindow.webContents.isLoading()) {
        this.captureWindow.webContents.once('did-finish-load', resolve);
      } else {
        resolve();
      }
    });
    
    // Give it a moment for preload script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async resolveSourceId() {
    // Try multiple times as the window might not be immediately available
    for (let attempt = 0; attempt < 5; attempt++) {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 0, height: 0 }
      });

      // Try to find Meet window - check various possible names
      const meetSource = sources.find((source) => {
        const name = source.name.toLowerCase();
        return name.includes('meet') || 
               name.includes('google meet') ||
               name.includes('chrome') && (name.includes('meet') || name.includes('google'));
      });

      if (meetSource) {
        console.log(`✅ Found Meet window: ${meetSource.name} (${meetSource.id})`);
        return meetSource.id;
      }

      if (attempt < 4) {
        console.log(`⚠️ Meet window not found, retrying... (attempt ${attempt + 1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // List available windows for debugging
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 }
    });
    const windowNames = sources.map(s => s.name).join(', ');
    throw new Error(`Google Meet window not found. Available windows: ${windowNames}. Please ensure the Meet window is open and visible.`);
  }

  registerIpcHandlers() {
    if (this.ipcRegistered) {
      return;
    }

    ipcMain.on('capture-chunk', (_event, payload) => {
      if (!this.recording || !payload) return;
      if (payload.sessionId !== this.sessionId) return;
      if (this.onChunkCallback && payload.chunk) {
        const int16 = new Int16Array(payload.chunk);
        this.onChunkCallback(int16);
      }
    });

    ipcMain.on('capture-error', (_event, payload) => {
      if (!payload || payload.sessionId !== this.sessionId) return;
      const error = new Error(payload.message || 'Audio capture error');
      this.recording = false;
      if (this._rejectStart) {
        this._rejectStart(error);
      } else {
        console.error('Audio capture error:', error.message);
      }
    });

    ipcMain.on('capture-log', (_event, payload) => {
      if (payload?.message) {
        console.log(`🎧 [Capture] ${payload.message}`);
      }
    });

    this.ipcRegistered = true;
  }

  async start(onChunk) {
    if (this.recording) {
      throw new Error('Recording already in progress');
    }

    await this.ensureCaptureWindow();
    this.registerIpcHandlers();

    this.onChunkCallback = onChunk;
    this.recording = true;
    this.sessionId = randomUUID();

    const sourceId = await this.resolveSourceId();

    await new Promise((resolve, reject) => {
      const startedHandler = (_event, payload) => {
        if (!payload || payload.sessionId !== this.sessionId) return;
        cleanup();
        resolve();
      };

      const errorHandler = (_event, payload) => {
        if (!payload || payload.sessionId !== this.sessionId) return;
        cleanup();
        this.recording = false;
        reject(new Error(payload.message || 'Audio capture failed'));
      };

      const cleanup = () => {
        ipcMain.removeListener('capture-started', startedHandler);
        ipcMain.removeListener('capture-error', errorHandler);
        this._rejectStart = null;
      };

      ipcMain.on('capture-started', startedHandler);
      ipcMain.on('capture-error', errorHandler);
      this._rejectStart = reject;

      this.captureWindow.webContents.send('capture-start', {
        sessionId: this.sessionId,
        sampleRate: this.sampleRate,
        channels: this.channels,
        chunkDuration: this.chunkDuration,
        sourceId
      });
    });

    console.log('✅ Audio capture started');
  }

  async stop() {
    if (!this.recording || !this.captureWindow) {
      return;
    }

    await new Promise((resolve) => {
      const stoppedHandler = (_event, payload) => {
        if (!payload || payload.sessionId !== this.sessionId) return;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        ipcMain.removeListener('capture-stopped', stoppedHandler);
      };

      ipcMain.on('capture-stopped', stoppedHandler);

      this.captureWindow.webContents.send('capture-stop', {
        sessionId: this.sessionId
      });
    });

    this.recording = false;
    this.sessionId = null;
    console.log('✅ Audio capture stopped');
  }

  isRecording() {
    return this.recording;
  }
}

module.exports = { AudioCapture };