// main.js - Electron Main Process
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { AudioCapture } = require('./audio-capture');
const { MeetHandler } = require('./meet-handler');
const { APIClient } = require('./api-client');

let mainWindow;
let meetWindow;
let tray;
let trayMenu;
let audioCapture;
let meetHandler;
let apiClient;
let currentMeetingId = null;

// Configuration
const CONFIG = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8000',
  audioSampleRate: 16000,
  audioChannels: 1,
  chunkDuration: 10 // seconds
};

const FALLBACK_ICON = path.join(__dirname, '../../../chrome-extantion/icons/swimming-pool.png');

function getAssetIcon(filename) {
  const assetPath = path.join(__dirname, '../../assets', filename);
  if (fs.existsSync(assetPath)) {
    return assetPath;
  }
  if (fs.existsSync(FALLBACK_ICON)) {
    console.warn(`⚠️  Missing asset ${filename}, using fallback icon.`);
    return FALLBACK_ICON;
  }
  console.warn(`⚠️  Missing asset ${filename} and fallback icon. Tray icon may not render.`);
  return nativeImage.createEmpty();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: getAssetIcon('icon.png'),
    title: 'Google Meet Recorder',
    autoHideMenuBar: true
  });

  // Load renderer HTML
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(rendererPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (audioCapture && audioCapture.isRecording()) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Recording in Progress',
        message: 'A recording is still in progress. Stop recording before closing?',
        buttons: ['Stop & Close', 'Cancel'],
        defaultId: 1
      }).then(result => {
        if (result.response === 0) {
          stopRecording();
          mainWindow.destroy();
        }
      });
    }
  });
}

function createTray() {
  const trayIcon = getAssetIcon('tray-icon.png');
  tray = new Tray(trayIcon);
  
  trayMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Recording',
      type: 'checkbox',
      checked: false,
      enabled: false,
      id: 'recording-status'
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(trayMenu);
  tray.setToolTip('Google Meet Recorder');
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// Initialize components
async function initializeComponents() {
  try {
    apiClient = new APIClient(CONFIG.backendUrl);
    audioCapture = new AudioCapture({
      sampleRate: CONFIG.audioSampleRate,
      channels: CONFIG.audioChannels,
      chunkDuration: CONFIG.chunkDuration
    });
    meetHandler = new MeetHandler();

    console.log('✅ All components initialized');
  } catch (error) {
    console.error('❌ Initialization error:', error);
    dialog.showErrorBox('Initialization Error', error.message);
  }
}

// IPC Handlers
ipcMain.handle('start-recording', async (event, meetUrl, meetingTitle) => {
  try {
    console.log(`🎙️ Starting recording for: ${meetUrl}`);

    // Validate Meet URL
    if (!meetUrl || !meetUrl.includes('meet.google.com')) {
      throw new Error('Invalid Google Meet URL');
    }

    // Generate meeting ID
    currentMeetingId = `meeting_${Date.now()}`;

    // Open Meet window
    meetWindow = await meetHandler.openMeet(meetUrl);
    
    // Wait for user to join and window to be ready
    console.log('⏳ Waiting for Meet window to be ready...');
    await new Promise(resolve => setTimeout(resolve, 8000)); // Increased wait time

    // Start audio capture
    console.log('🎙️ Starting audio capture...');
    await audioCapture.start((audioChunk) => {
      // Stream audio to backend
      apiClient.streamAudioChunk(currentMeetingId, audioChunk);
    });

    // Connect to WebSocket for live transcription
    apiClient.connectWebSocket(currentMeetingId, (data) => {
      // Send transcript updates to renderer
      if (mainWindow) {
        mainWindow.webContents.send('transcript-update', data);
      }
    });

    // Update tray
    updateTrayRecordingStatus(true);

    return {
      success: true,
      meetingId: currentMeetingId,
      message: 'Recording started successfully'
    };

  } catch (error) {
    console.error('❌ Error starting recording:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('stop-recording', async () => {
  try {
    return await stopRecording();
  } catch (error) {
    console.error('❌ Error stopping recording:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

async function stopRecording() {
  console.log('⏹️ Stopping recording...');

  // Stop audio capture
  if (audioCapture) {
    await audioCapture.stop();
  }

  // Disconnect WebSocket
  if (apiClient) {
    apiClient.disconnectWebSocket();
  }

  // Close Meet window
  if (meetWindow) {
    if (!meetWindow.isDestroyed()) {
      meetWindow.close();
    }
    meetWindow = null;
  }

  // Request final summary from backend
  let summary = 'Summary unavailable';
  if (currentMeetingId && apiClient) {
    try {
      summary = await apiClient.finalizeMeeting(currentMeetingId);
    } catch (error) {
      console.error('Error finalizing meeting:', error);
      summary = 'Summary unavailable - recording stopped successfully but summary generation failed.';
    }
    
    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('meeting-completed', {
        meetingId: currentMeetingId,
        summary: summary
      });
    }
  }

  // Update tray
  updateTrayRecordingStatus(false);

  const result = {
    success: true,
    meetingId: currentMeetingId,
    message: 'Recording stopped successfully'
  };

  currentMeetingId = null;
  return result;
}

ipcMain.handle('get-meetings', async () => {
  try {
    const meetings = await apiClient.getMeetings();
    return { success: true, meetings };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-meeting-details', async (event, meetingId) => {
  try {
    const meeting = await apiClient.getMeetingDetails(meetingId);
    return { success: true, meeting };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-report', async (event, meetingId) => {
  try {
    const savePath = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Meeting Report',
      defaultPath: `meeting_report_${meetingId}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (!savePath.canceled) {
      await apiClient.downloadReport(meetingId, savePath.filePath);
      return { success: true, path: savePath.filePath };
    }
    return { success: false, error: 'Save canceled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-meeting', async (event, meetingId) => {
  try {
    await apiClient.deleteMeeting(meetingId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ask-question', async (event, meetingId, question) => {
  try {
    const answer = await apiClient.askQuestion(meetingId, question);
    return { success: true, answer };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-audio-devices', async () => {
  try {
    const devices = await audioCapture.getAvailableDevices();
    return { success: true, devices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function updateTrayRecordingStatus(isRecording) {
  if (!tray || !trayMenu) return;

  const recordingItem = trayMenu.getMenuItemById('recording-status');
  if (recordingItem) {
    recordingItem.checked = isRecording;
    tray.setContextMenu(trayMenu);
  }

  const statusIcon = getAssetIcon(`tray-icon${isRecording ? '-recording' : ''}.png`);
  if (statusIcon) {
    tray.setImage(statusIcon);
  }
}

// App lifecycle
app.whenReady().then(async () => {
  await initializeComponents();
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (audioCapture && audioCapture.isRecording()) {
    event.preventDefault();
    await stopRecording();
    app.quit();
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Application Error', error.message);
});

// Exports for testing
module.exports = {
  createMainWindow,
  stopRecording
};