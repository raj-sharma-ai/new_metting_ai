const { ipcRenderer } = require('electron');

let audioContext = null;
let processor = null;
let sourceNode = null;
let mediaStream = null;
let recording = false;
let sessionId = null;
let chunkDuration = 10;
let sampleRate = 16000;
let channels = 1;
let buffer = [];

const log = (message) => {
  ipcRenderer.send('capture-log', { message });
};

const floatTo16BitPCM = (float32Array) => {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Int16Array(buffer);
};

const cleanupStream = async () => {
  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
    processor = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  buffer = [];
  recording = false;
  sessionId = null;
};

const startProcessing = async (config) => {
  recording = true;
  sessionId = config.sessionId;
  chunkDuration = config.chunkDuration || 10;
  sampleRate = config.sampleRate || 16000;
  channels = config.channels || 1;

  // Use the correct constraints format for Electron desktop capture
  // Try both old and new format for compatibility
  let constraints;
  
  // First try the Electron-specific format
  try {
    constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: config.sourceId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: config.sourceId
        }
      }
    };

    log(`Attempting to capture from source: ${config.sourceId}`);
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    log('Media stream obtained successfully');
  } catch (error) {
    log(`First attempt failed: ${error.message}, trying alternative format...`);
    
    // Try alternative format
    try {
      constraints = {
        audio: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: config.sourceId,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: config.sourceId
        }
      };
      
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      log('Media stream obtained successfully with alternative format');
    } catch (error2) {
      log(`Both attempts failed. Last error: ${error2.message}`);
      throw new Error(`Could not start video source: ${error2.message}. Original error: ${error.message}`);
    }
  }

  audioContext = new AudioContext({
    sampleRate
  });

  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(4096, channels, channels);

  const samplesPerChunk = sampleRate * chunkDuration;
  buffer = [];

  processor.onaudioprocess = (event) => {
    if (!recording) return;
    const inputData = event.inputBuffer.getChannelData(0);
    buffer.push(...inputData);

    if (buffer.length >= samplesPerChunk) {
      const chunk = new Float32Array(buffer.slice(0, samplesPerChunk));
      buffer = buffer.slice(samplesPerChunk);

      const pcmData = floatTo16BitPCM(chunk);
      ipcRenderer.send('capture-chunk', {
        sessionId,
        chunk: Array.from(pcmData)
      });
    }
  };

  sourceNode.connect(processor);
  processor.connect(audioContext.destination);

  log('Capture pipeline initialized');
};

ipcRenderer.on('capture-start', async (_event, config) => {
  if (recording) {
    ipcRenderer.send('capture-error', {
      sessionId: config.sessionId,
      message: 'Capture already in progress'
    });
    return;
  }

  try {
    await startProcessing(config);
    ipcRenderer.send('capture-started', { sessionId: config.sessionId });
  } catch (error) {
    await cleanupStream();
    ipcRenderer.send('capture-error', {
      sessionId: config.sessionId,
      message: error.message
    });
  }
});

ipcRenderer.on('capture-stop', async (_event, payload) => {
  if (!recording || payload.sessionId !== sessionId) {
    ipcRenderer.send('capture-stopped', { sessionId: payload.sessionId });
    return;
  }

  await cleanupStream();
  ipcRenderer.send('capture-stopped', { sessionId: payload.sessionId });
});

