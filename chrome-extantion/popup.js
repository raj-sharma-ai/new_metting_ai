// Popup Script - Handles user interactions



//this is popup.js file

const elements = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  statusDetails: document.getElementById('statusDetails'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  loadingState: document.getElementById('loadingState'),
  summaryContainer: document.getElementById('summaryContainer'),
  summaryText: document.getElementById('summaryText'),
  viewFullLink: document.getElementById('viewFullLink')
};

// Initialize popup
async function init() {
  console.log('Popup initialized');
  
  try {
    // Load latest state
    await updateUI();
    
    // Setup event listeners
    elements.startBtn.addEventListener('click', handleStartRecording);
    elements.stopBtn.addEventListener('click', handleStopRecording);
    elements.viewFullLink.addEventListener('click', handleViewFull);
    
    // Check if on Google Meet
    await checkIfOnGoogleMeet();
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

// Check if current tab is Google Meet
async function checkIfOnGoogleMeet() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('meet.google.com')) {
      elements.statusDetails.textContent = 'Google Meet detected ✓';
      elements.startBtn.disabled = false;
    } else {
      elements.statusDetails.textContent = 'Please open a Google Meet';
      elements.startBtn.disabled = true;
    }
  } catch (error) {
    console.error('Failed to check tab:', error);
  }
}

// Update UI based on current state
async function updateUI() {
  try {
    // Get recording state
    const response = await chrome.runtime.sendMessage({ 
      action: 'GET_RECORDING_STATE' 
    });
    
    const state = response?.state;
    
    if (state && state.isRecording) {
      showRecordingState(state);
    } else {
      showIdleState();
    }
    
    // Load latest summary
    const storage = await chrome.storage.local.get(['latestSummary']);
    if (storage.latestSummary) {
      showSummary(storage.latestSummary);
    }
    
  } catch (error) {
    console.error('Failed to update UI:', error);
    // Fallback to idle state
    showIdleState();
  }
}

// Show idle state
function showIdleState() {
  elements.statusDot.className = 'status-indicator idle';
  elements.statusText.textContent = 'Idle';
  elements.startBtn.classList.remove('hidden');
  elements.stopBtn.classList.add('hidden');
  elements.loadingState.classList.add('hidden');
}

// Show recording state
function showRecordingState(state) {
  elements.statusDot.className = 'status-indicator recording';
  elements.statusText.textContent = 'Recording';
  
  // Calculate duration
  const duration = Math.floor((Date.now() - state.startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  elements.statusDetails.textContent = `Recording: ${minutes}m ${seconds}s`;
  
  elements.startBtn.classList.add('hidden');
  elements.stopBtn.classList.remove('hidden');
  elements.loadingState.classList.add('hidden');
}

// Show processing state
function showProcessingState() {
  elements.statusDot.className = 'status-indicator';
  elements.statusText.textContent = 'Processing';
  elements.statusDetails.textContent = 'Transcribing and summarizing...';
  elements.startBtn.classList.add('hidden');
  elements.stopBtn.classList.add('hidden');
  elements.loadingState.classList.remove('hidden');
}

// Show summary
function showSummary(data) {
  elements.summaryContainer.classList.remove('hidden');
  
  // Format summary preview (first 300 chars)
  const preview = data.summary.substring(0, 300) + 
    (data.summary.length > 300 ? '...' : '');
  
  elements.summaryText.textContent = preview;
  
  // Store meeting ID for full view
  elements.viewFullLink.dataset.meetingId = data.meeting_id;
}

// Handle start recording
async function handleStartRecording() {
  try {
    elements.startBtn.disabled = true;
    elements.statusDetails.textContent = 'Starting recording...';
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }
    
    // Verify it's a Google Meet tab
    if (!tab.url || !tab.url.includes('meet.google.com')) {
      throw new Error('Please open a Google Meet tab first');
    }
    
    // Send start recording message with tab ID
    const response = await chrome.runtime.sendMessage({ 
      action: 'START_RECORDING',
      tabId: tab.id  // Explicitly send tab ID
    });
    
    if (response && response.success) {
      console.log('Recording started:', response.meetingId);
      
      // Update content script indicator
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'UPDATE_INDICATOR',
          isRecording: true
        });
      } catch (err) {
        console.warn('Could not update indicator:', err);
      }
      
      // Update UI
      await updateUI();
      
    } else {
      throw new Error(response?.error || 'Failed to start recording');
    }
    
  } catch (error) {
    console.error('Start recording error:', error);
    alert(`Failed to start recording: ${error.message}`);
    elements.startBtn.disabled = false;
    showIdleState();
  }
}

// Handle stop recording
async function handleStopRecording() {
  try {
    elements.stopBtn.disabled = true;
    showProcessingState();
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send stop recording message
    const response = await chrome.runtime.sendMessage({ 
      action: 'STOP_RECORDING' 
    });
    
    if (response && response.success) {
      console.log('Recording stopped:', response.result);
      
      // Update content script indicator if tab available
      if (tab && tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'UPDATE_INDICATOR',
            isRecording: false
          });
        } catch (err) {
          console.warn('Could not update indicator:', err);
        }
      }
      
      // Show summary
      if (response.result) {
        showSummary(response.result);
      }
      
      // Back to idle
      showIdleState();
      
      alert('✅ Meeting processed successfully! Summary is ready.');
      
    } else {
      throw new Error(response?.error || 'Failed to stop recording');
    }
    
  } catch (error) {
    console.error('Stop recording error:', error);
    alert(`Failed to process meeting: ${error.message}`);
    showIdleState();
  } finally {
    elements.stopBtn.disabled = false;
  }
}

// Handle view full report
function handleViewFull(e) {
  const meetingId = e.target.dataset.meetingId;
  if (meetingId) {
    // Open Streamlit app with meeting details
    const url = `http://localhost:8500?meeting_id=${meetingId}`;
    chrome.tabs.create({ url: url });
  }
}

// Refresh UI every 2 seconds when recording
setInterval(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'GET_RECORDING_STATE' 
    });
    
    if (response?.state?.isRecording) {
      showRecordingState(response.state);
    }
  } catch (error) {
    // Silently ignore if background script not available
    console.debug('Failed to get recording state:', error);
  }
}, 2000);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}