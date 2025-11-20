// // Background Service Worker - Detects Google Meet and manages recording
// // Fixed version with proper Manifest V3 APIs

// const API_BASE_URL = 'http://localhost:8000';

// // State management
// let recordingState = {
//   isRecording: false,
//   meetingId: null,
//   mediaRecorder: null,
//   audioChunks: [],
//   startTime: null
// };

// // Listen for messages from content script and popup
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   console.log('Background received message:', request.action);

//   switch (request.action) {
//     case 'MEETING_DETECTED':
//       if (sender.tab && sender.tab.id) {
//         handleMeetingDetected(sender.tab.id, request.data);
//         sendResponse({ success: true });
//       } else {
//         sendResponse({ success: false, error: 'No tab information' });
//       }
//       break;

//     case 'START_RECORDING':
//       const tabId = request.tabId || (sender.tab && sender.tab.id);
//       if (tabId) {
//         startRecording(tabId)
//           .then(result => sendResponse(result))
//           .catch(error => sendResponse({ success: false, error: error.message }));
//       } else {
//         sendResponse({ success: false, error: 'No active tab found' });
//       }
//       return true;

//     case 'STOP_RECORDING':
//       stopRecording()
//         .then(result => sendResponse(result))
//         .catch(error => sendResponse({ success: false, error: error.message }));
//       return true;

//     case 'GET_RECORDING_STATE':
//       sendResponse({ state: recordingState });
//       break;
      
//     default:
//       sendResponse({ success: false, error: 'Unknown action' });
//   }
  
//   return true;
// });

// // Handle meeting detection
// function handleMeetingDetected(tabId, data) {
//   console.log('Meeting detected:', data);
  
//   chrome.storage.local.set({
//     currentMeeting: {
//       tabId: tabId,
//       meetingCode: data.meetingCode,
//       detectedAt: Date.now()
//     }
//   });

//   // Show notification with unique ID
//   chrome.notifications.create(
//     `meeting-detected-${Date.now()}`, // Add unique ID
//     {
//       type: 'basic',
//       iconUrl: 'icons/icons/swimming-pool.png',
//       title: 'Google Meet Detected',
//       message: 'Click extension icon to start recording',
//       priority: 2
//     }
//   );
// }

// // Start audio recording from tab - FIXED for Manifest V3
// async function startRecording(tabId) {
//   try {
//     if (recordingState.isRecording) {
//       throw new Error('Recording already in progress');
//     }

//     console.log('Starting recording for tab:', tabId);

//     // Get tab audio stream using getDisplayMedia via content script
//     const stream = await getTabAudioStream(tabId);
    
//     if (!stream) {
//       throw new Error('Failed to capture audio stream');
//     }

//     // Initialize recording state
//     recordingState = {
//       isRecording: true,
//       meetingId: `meeting_${Date.now()}`,
//       audioChunks: [],
//       startTime: Date.now()
//     };

//     // Start processing audio stream
//     await processAudioStream(stream);

//     // Update badge
//     chrome.action.setBadgeText({ text: 'REC' });
//     chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

//     return { 
//       success: true, 
//       message: 'Recording started',
//       meetingId: recordingState.meetingId 
//     };

//   } catch (error) {
//     console.error('Failed to start recording:', error);
//     recordingState.isRecording = false;
//     return { success: false, error: error.message };
//   }
// }

// // Get tab audio stream via offscreen document (Manifest V3 way)
// async function getTabAudioStream(tabId) {
//   try {
//     // Create offscreen document if it doesn't exist
//     await setupOffscreenDocument();
    
//     // Request stream ID from tab
//     const streamId = await chrome.tabCapture.getMediaStreamId({
//       targetTabId: tabId
//     });

//     console.log('Got stream ID:', streamId);

//     // Send stream ID to offscreen document to get actual stream
//     const response = await chrome.runtime.sendMessage({
//       type: 'START_CAPTURE',
//       streamId: streamId
//     });

//     return response.stream;

//   } catch (error) {
//     console.error('Failed to get stream:', error);
//     throw error;
//   }
// }

// // Setup offscreen document for audio processing
// async function setupOffscreenDocument() {
//   const existingContexts = await chrome.runtime.getContexts({
//     contextTypes: ['OFFSCREEN_DOCUMENT']
//   });

//   if (existingContexts.length > 0) {
//     return; // Already exists
//   }

//   await chrome.offscreen.createDocument({
//     url: 'offscreen.html',
//     reasons: ['USER_MEDIA'],
//     justification: 'Recording audio from Google Meet tab'
//   });
// }

// // Process audio stream - SIMPLIFIED VERSION
// async function processAudioStream(stream) {
//   try {
//     // Send message to offscreen document to start recording
//     chrome.runtime.sendMessage({
//       type: 'START_RECORDING',
//       stream: stream
//     });

//     console.log('Audio recording started in offscreen document');

//   } catch (error) {
//     console.error('Failed to process stream:', error);
//     throw error;
//   }
// }

// // Stop recording and send to backend
// async function stopRecording() {
//   try {
//     if (!recordingState.isRecording) {
//       throw new Error('No recording in progress');
//     }

//     console.log('Stopping recording...');

//     // Get audio data from offscreen document
//     const response = await chrome.runtime.sendMessage({
//       type: 'STOP_RECORDING'
//     });

//     if (!response || !response.audioBlob) {
//       throw new Error('Failed to get audio data');
//     }

//     // Convert base64 back to blob
//     const audioBlob = base64ToBlob(response.audioBlob.data, response.audioBlob.type);
//     console.log('Audio blob received:', audioBlob.size, 'bytes');

//     // Reset badge
//     chrome.action.setBadgeText({ text: '' });

//     // Send to backend for processing
//     const result = await sendToBackend(audioBlob);

//     // Reset state
//     recordingState = {
//       isRecording: false,
//       meetingId: null,
//       audioChunks: [],
//       startTime: null
//     };

//     return { 
//       success: true, 
//       message: 'Recording stopped and sent for processing',
//       result: result 
//     };

//   } catch (error) {
//     console.error('Failed to stop recording:', error);
//     recordingState.isRecording = false;
//     return { success: false, error: error.message };
//   }
// }

// // Helper function to convert base64 to Blob
// function base64ToBlob(base64, type) {
//   const binaryString = atob(base64);
//   const bytes = new Uint8Array(binaryString.length);
//   for (let i = 0; i < binaryString.length; i++) {
//     bytes[i] = binaryString.charCodeAt(i);
//   }
//   return new Blob([bytes], { type: type });
// }

// // Send audio to FastAPI backend
// async function sendToBackend(audioBlob) {
//   try {
//     const audioFile = new File(
//       [audioBlob], 
//       `meeting_${Date.now()}.webm`,
//       { type: 'audio/webm' }
//     );

//     const formData = new FormData();
//     formData.append('file', audioFile);
//     formData.append('meeting_title', `Google Meet - ${new Date().toLocaleString()}`);

//     console.log('Sending to backend:', audioFile.size, 'bytes');

//     const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
//       method: 'POST',
//       body: formData
//     });

//     if (!response.ok) {
//       throw new Error(`API error: ${response.status}`);
//     }

//     const result = await response.json();
//     console.log('Backend response:', result);

//     chrome.storage.local.set({
//       latestSummary: result,
//       lastProcessed: Date.now()
//     });

//     chrome.notifications.create(
//       `summary-ready-${Date.now()}`,
//       {
//         type: 'basic',
//         iconUrl: 'icons/swimming-pool.png',
//         title: 'Meeting Processed!',
//         message: 'Summary is ready. Click extension to view.',
//         priority: 2
//       }
//     );

//     return result;

//   } catch (error) {
//     console.error('Failed to send to backend:', error);
//     throw error;
//   }
// }

// // Clean up on extension unload
// chrome.runtime.onSuspend.addListener(() => {
//   if (recordingState.isRecording) {
//     stopRecording();
//   }
// });

// // Clean up when meeting tab is closed
// chrome.tabs.onRemoved.addListener((tabId) => {
//   chrome.storage.local.get(['currentMeeting'], (result) => {
//     if (result.currentMeeting && result.currentMeeting.tabId === tabId) {
//       console.log('Meeting tab closed:', tabId);
//       if (recordingState.isRecording) {
//         stopRecording().catch(err => console.error('Failed to stop recording:', err));
//       }
//       chrome.storage.local.remove(['currentMeeting']);
//     }
//   });
// });







// Background Service Worker - Detects Google Meet and manages recording
// Fixed version with proper Manifest V3 APIs
//  Google Meet detect karna
// Audio record start / stop karna
// Audio ko FastAPI backend bhejna
// Offscreen document ke through tab audio capture karna (Manifest V3 rule)
const API_BASE_URL = 'http://localhost:8000';

// State management
let recordingState = {
  isRecording: false,
  meetingId: null,
  mediaRecorder: null,
  audioChunks: [],
  startTime: null
};

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);

  switch (request.action) {
    case 'MEETING_DETECTED':
      if (sender.tab && sender.tab.id) {
        handleMeetingDetectexd(sender.tab.id, request.data);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No tab information' });
      }
      break;

    case 'START_RECORDING':
      const tabId = request.tabId || (sender.tab && sender.tab.id);
      if (tabId) {
        startRecording(tabId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
      return true;

    case 'STOP_RECORDING':
      stopRecording()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_RECORDING_STATE':
      sendResponse({ state: recordingState });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Handle meeting detection
function handleMeetingDetected(tabId, data) {
  console.log('Meeting detected:', data);
  
  chrome.storage.local.set({
    currentMeeting: {
      tabId: tabId,
      meetingCode: data.meetingCode,
      detectedAt: Date.now()
    }
  });

  // Show notification with unique ID
  chrome.notifications.create(
    `meeting-detected-${Date.now()}`, // Add unique ID
    {
      type: 'basic',
      iconUrl: 'icons/swimming-pool (1).png',
      title: 'Google Meet Detected',
      message: 'Click extension icon to start recording',
      priority: 2
    }
  );
}

// Start audio recording from tab - FIXED for Manifest V3
async function startRecording(tabId) {
  try {
    if (recordingState.isRecording) {
      throw new Error('Recording already in progress');
    }

    console.log('Starting recording for tab:', tabId);

    // Get tab audio stream using getDisplayMedia via content script
    const stream = await getTabAudioStream(tabId);
    
    if (!stream) {
      throw new Error('Failed to capture audio stream');
    }

    // Initialize recording state
    recordingState = {
      isRecording: true,
      meetingId: `meeting_${Date.now()}`,
      audioChunks: [],
      startTime: Date.now()
    };

    // Start processing audio stream
    await processAudioStream(stream);

    // Update badge
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

    return { 
      success: true, 
      message: 'Recording started',
      meetingId: recordingState.meetingId 
    };

  } catch (error) {
    console.error('Failed to start recording:', error);
    recordingState.isRecording = false;
    return { success: false, error: error.message };
  }
}

// Get tab audio stream via offscreen document (Manifest V3 way)
async function getTabAudioStream(tabId) {
  try {
    // Create offscreen document if it doesn't exist
    await setupOffscreenDocument();
    
    // Request stream ID from tab
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    console.log('Got stream ID:', streamId);

    // Send stream ID to offscreen document to get actual stream
    const response = await chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      streamId: streamId
    });

    return response.stream;

  } catch (error) {
    console.error('Failed to get stream:', error);
    throw error;
  }
}

// Setup offscreen document for audio processing
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return; // Already exists
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Recording audio from Google Meet tab'
  });
}

// Process audio stream - SIMPLIFIED VERSION
async function processAudioStream(stream) {
  try {
    // Send message to offscreen document to start recording
    chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      stream: stream
    });

    console.log('Audio recording started in offscreen document');

  } catch (error) {
    console.error('Failed to process stream:', error);
    throw error;
  }
}

// Stop recording and send to backend
async function stopRecording() {
  try {
    if (!recordingState.isRecording) {
      throw new Error('No recording in progress');
    }

    console.log('Stopping recording...');

    // Get audio data from offscreen document
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING'
    });

    if (!response || !response.audioBlob) {
      throw new Error('Failed to get audio data');
    }

    // Convert base64 back to blob
    const audioBlob = base64ToBlob(response.audioBlob.data, response.audioBlob.type);
    console.log('Audio blob received:', audioBlob.size, 'bytes');

    // Reset badge
    chrome.action.setBadgeText({ text: '' });

    // Send to backend for processing
    const result = await sendToBackend(audioBlob);

    // Reset state
    recordingState = {
      isRecording: false,
      meetingId: null,
      audioChunks: [],
      startTime: null
    };

    return { 
      success: true, 
      message: 'Recording stopped and sent for processing',
      result: result 
    };

  } catch (error) {
    console.error('Failed to stop recording:', error);
    recordingState.isRecording = false;
    return { success: false, error: error.message };
  }
}

// Helper function to convert base64 to Blob
function base64ToBlob(base64, type) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: type });
}

// Send audio to FastAPI backend
async function sendToBackend(audioBlob) {
  try {
    const audioFile = new File(
      [audioBlob], 
      `meeting_${Date.now()}.webm`,
      { type: 'audio/webm' }
    );

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('meeting_title', `Google Meet - ${new Date().toLocaleString()}`);

    console.log('Sending to backend:', audioFile.size, 'bytes');

    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Backend response:', result);

    chrome.storage.local.set({
      latestSummary: result,
      lastProcessed: Date.now()
    });

    chrome.notifications.create(
      `summary-ready-${Date.now()}`,
      {
        type: 'basic',
        iconUrl: 'icons/swimming-pool (1).png',
        title: 'Meeting Processed!',
        message: 'Summary is ready. Click extension to view.',
        priority: 2
      }
    );

    return result;

  } catch (error) {
    console.error('Failed to send to backend:', error);
    throw error;
  }
}

// Clean up on extension unload
chrome.runtime.onSuspend.addListener(() => {
  if (recordingState.isRecording) {
    stopRecording();
  }
});

// Clean up when meeting tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['currentMeeting'], (result) => {
    if (result.currentMeeting && result.currentMeeting.tabId === tabId) {
      console.log('Meeting tab closed:', tabId);
      if (recordingState.isRecording) {
        stopRecording().catch(err => console.error('Failed to stop recording:', err));
      }
      chrome.storage.local.remove(['currentMeeting']);
    }
  });
});