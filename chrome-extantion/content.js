

// Content Script - Runs on Google Meet pages



// Meeting detect karta hai
// ✔️ Background ko notify karta hai
// ✔️ URL change track karta hai
// ✔️ Meet tab ke andar recording indicator show karta hai
// ✔️ Chrome extension UI ko Meet page me sync karta hai

// Ye audio record nahi karta!
// Ye page ke andar ka logic sambhalta hai.

console.log('AI Meet Summarizer: Content script loaded');

// State
let meetingDetected = false;
let meetingCode = null;

// Detect if user is in an active meeting
function detectMeeting() {
  // Check URL pattern for meeting code
  const urlMatch = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
  
  if (urlMatch) {
    meetingCode = urlMatch[1];
    
    // Additional check: look for video elements (more reliable)
    const hasVideo = document.querySelector('video') !== null;
    const hasMeetingUI = document.querySelector('[data-meeting-code]') !== null;
    
    if (hasVideo || hasMeetingUI) {
      if (!meetingDetected) {
        meetingDetected = true;
        notifyMeetingDetected();
      }
      return true;
    }
  }
  
  meetingDetected = false;
  return false;
}

// Notify background script
function notifyMeetingDetected() {
  console.log('Meeting detected:', meetingCode);
  
  chrome.runtime.sendMessage({
    action: 'MEETING_DETECTED',
    data: {
      meetingCode: meetingCode,
      url: window.location.href,
      timestamp: Date.now()
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to notify background:', chrome.runtime.lastError);
      return;
    }
    console.log('Background notified:', response);
  });
}

// Monitor for meeting state changes
function startMonitoring() {
  console.log('Starting meeting monitoring...');
  
  // Check immediately
  detectMeeting();
  
  // Check every 3 seconds
  setInterval(detectMeeting, 3000);
  
  // Also watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('URL changed:', currentUrl);
      detectMeeting();
    }
  }).observe(document, { subtree: true, childList: true });
}

// Inject visual indicator (optional)
function injectRecordingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'ai-meet-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: 'Segoe UI', Tahoma, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
    display: none;
    align-items: center;
    gap: 8px;
  `;
  
  indicator.innerHTML = `
    <span style="display: inline-block; width: 8px; height: 8px; background: #ff4444; border-radius: 50%; animation: pulse 1.5s infinite;"></span>
    <span>AI Recorder Active</span>
  `;
  
  // Add pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(indicator);
  
  return indicator;
}

// Listen for recording state changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'UPDATE_INDICATOR') {
    const indicator = document.getElementById('ai-meet-indicator');
    if (indicator) {
      indicator.style.display = request.isRecording ? 'flex' : 'none';
    }
  }
  sendResponse({ success: true });
  return true; // Keep channel open
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startMonitoring();
    injectRecordingIndicator();
  });
} else {
  startMonitoring();
  injectRecordingIndicator();
}

console.log('AI Meet Summarizer: Monitoring started');
