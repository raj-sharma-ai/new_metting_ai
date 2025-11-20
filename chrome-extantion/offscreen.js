// Offscreen document for audio processing
// This runs in a separate context to handle MediaRecorder

let mediaRecorder = null;
let audioChunks = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received:', message.type);

  switch (message.type) {
    case 'START_CAPTURE':
      startCapture(message.streamId)
        .then(stream => sendResponse({ stream: stream }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'START_RECORDING':
      startRecording()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'STOP_RECORDING':
      stopRecording()
        .then(blob => sendResponse({ audioBlob: blob }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
  }

  return true;
});

async function startCapture(streamId) {
  try {
    // Get media stream from stream ID
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    console.log('Stream captured:', stream);
    
    // Store stream and start recording
    window.capturedStream = stream;
    return stream;

  } catch (error) {
    console.error('Failed to capture stream:', error);
    throw error;
  }
}

async function startRecording() {
  try {
    if (!window.capturedStream) {
      throw new Error('No stream available');
    }

    audioChunks = [];

    mediaRecorder = new MediaRecorder(window.capturedStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        console.log('Chunk collected:', event.data.size);
      }
    };

    mediaRecorder.onerror = (error) => {
      console.error('MediaRecorder error:', error);
    };

    // Start recording with 1 second chunks
    mediaRecorder.start(1000);
    console.log('Recording started');

  } catch (error) {
    console.error('Failed to start recording:', error);
    throw error;
  }
}

async function stopRecording() {
  try {
    if (!mediaRecorder) {
      throw new Error('No active recording');
    }

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        // Create blob from chunks
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        console.log('Recording stopped, blob size:', blob.size);

        // Stop stream tracks
        if (window.capturedStream) {
          window.capturedStream.getTracks().forEach(track => track.stop());
          window.capturedStream = null;
        }

        // Convert blob to base64 for message passing
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve({
            data: base64,
            type: 'audio/webm',
            size: blob.size
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      };

      mediaRecorder.stop();
    });

  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
}