// meet-handler.js - Google Meet Integration Module
const { BrowserWindow, session } = require('electron');
const path = require('path');

class MeetHandler {
  constructor() {
    this.meetWindow = null;
    this.authenticated = false;
  }

  /**
   * Open Google Meet in a new window
   * @param {string} meetUrl - Google Meet URL
   * @returns {BrowserWindow} Meet window instance
   */
  async openMeet(meetUrl) {
    if (this.meetWindow && !this.meetWindow.isDestroyed()) {
      this.meetWindow.focus();
      return this.meetWindow;
    }

    this.meetWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      title: 'Google Meet',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        // Allow camera and microphone access
        permissions: {
          'media': true
        }
      },
      icon: path.join(__dirname, '../../assets/meet-icon.png')
    });

    // Inject custom CSS to highlight recording status
    this.meetWindow.webContents.on('did-finish-load', () => {
      this.meetWindow.webContents.insertCSS(`
        body::before {
          content: "🔴 RECORDING";
          position: fixed;
          top: 10px;
          right: 10px;
          background: #ff0000;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          z-index: 999999;
          font-size: 14px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `);
    });

    // Handle permission requests
    this.meetWindow.webContents.session.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const allowedPermissions = ['media', 'mediaKeySystem', 'notifications'];
        if (allowedPermissions.includes(permission)) {
          callback(true);
        } else {
          callback(false);
        }
      }
    );

    // Handle external links
    this.meetWindow.webContents.setWindowOpenHandler(({ url }) => {
      // Open external links in default browser
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    });

    // Load Meet URL
    await this.meetWindow.loadURL(meetUrl);

    // Wait for authentication if needed
    if (!this.authenticated) {
      await this.waitForAuthentication();
    }

    // Optional: Auto-join meeting
    // await this.autoJoinMeeting();

    return this.meetWindow;
  }

  /**
   * Wait for user to authenticate with Google
   */
  async waitForAuthentication() {
    return new Promise((resolve) => {
      const checkAuth = setInterval(() => {
        if (this.meetWindow && !this.meetWindow.isDestroyed()) {
          this.meetWindow.webContents.executeJavaScript(`
            document.querySelector('[data-is-signed-in]') !== null
          `).then(isSignedIn => {
            if (isSignedIn) {
              this.authenticated = true;
              clearInterval(checkAuth);
              resolve();
            }
          }).catch(() => {});
        } else {
          clearInterval(checkAuth);
          resolve();
        }
      }, 1000);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(checkAuth);
        resolve();
      }, 60000);
    });
  }

  /**
   * Auto-join meeting (experimental)
   */
  async autoJoinMeeting() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return;
    }

    try {
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to click join button
      await this.meetWindow.webContents.executeJavaScript(`
        (function() {
          // Find and click "Join now" button
          const joinButton = Array.from(document.querySelectorAll('button, div'))
            .find(el => el.textContent.trim().toLowerCase().includes('join'));
          
          if (joinButton) {
            joinButton.click();
            return true;
          }
          return false;
        })();
      `);

      console.log('✅ Auto-join attempted');
    } catch (error) {
      console.error('❌ Auto-join failed:', error.message);
      // Let user join manually
    }
  }

  /**
   * Check if user is in meeting
   */
  async isInMeeting() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return false;
    }

    try {
      return await this.meetWindow.webContents.executeJavaScript(`
        (function() {
          // Check for meeting UI elements
          const inCall = document.querySelector('[data-self-name]') !== null;
          const hasParticipants = document.querySelectorAll('[data-participant-id]').length > 0;
          return inCall || hasParticipants;
        })();
      `);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get meeting participants
   */
  async getParticipants() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return [];
    }

    try {
      return await this.meetWindow.webContents.executeJavaScript(`
        (function() {
          const participants = [];
          document.querySelectorAll('[data-participant-id]').forEach(el => {
            const name = el.querySelector('[data-self-name]')?.textContent || 'Unknown';
            participants.push(name);
          });
          return participants;
        })();
      `);
    } catch (error) {
      return [];
    }
  }

  /**
   * Toggle microphone
   */
  async toggleMicrophone() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return;
    }

    await this.meetWindow.webContents.executeJavaScript(`
      (function() {
        const micButton = document.querySelector('[data-tooltip*="microphone" i]');
        if (micButton) micButton.click();
      })();
    `);
  }

  /**
   * Toggle camera
   */
  async toggleCamera() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return;
    }

    await this.meetWindow.webContents.executeJavaScript(`
      (function() {
        const camButton = document.querySelector('[data-tooltip*="camera" i]');
        if (camButton) camButton.click();
      })();
    `);
  }

  /**
   * Leave meeting
   */
  async leaveMeeting() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return;
    }

    try {
      await this.meetWindow.webContents.executeJavaScript(`
        (function() {
          const leaveButton = document.querySelector('[aria-label*="leave" i]');
          if (leaveButton) {
            leaveButton.click();
            return true;
          }
          return false;
        })();
      `);

      // Close window after leaving
      setTimeout(() => {
        if (this.meetWindow && !this.meetWindow.isDestroyed()) {
          this.meetWindow.close();
        }
      }, 1000);
    } catch (error) {
      console.error('Error leaving meeting:', error);
    }
  }

  /**
   * Get meeting title
   */
  async getMeetingTitle() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return 'Unknown Meeting';
    }

    try {
      return await this.meetWindow.webContents.executeJavaScript(`
        document.title || 'Google Meet';
      `);
    } catch (error) {
      return 'Unknown Meeting';
    }
  }

  /**
   * Inject custom controls (optional)
   */
  async injectRecordingControls() {
    if (!this.meetWindow || this.meetWindow.isDestroyed()) {
      return;
    }

    await this.meetWindow.webContents.executeJavaScript(`
      (function() {
        if (document.getElementById('custom-recording-ui')) return;

        const controlsDiv = document.createElement('div');
        controlsDiv.id = 'custom-recording-ui';
        controlsDiv.style.cssText = \`
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 15px 30px;
          border-radius: 30px;
          z-index: 999999;
          display: flex;
          gap: 15px;
          align-items: center;
        \`;

        controlsDiv.innerHTML = \`
          <span>🔴 Recording in progress</span>
          <button onclick="alert('Stop recording from main app')" 
                  style="background: #ff4444; color: white; border: none; 
                         padding: 8px 20px; border-radius: 15px; cursor: pointer;">
            Stop Recording
          </button>
        \`;

        document.body.appendChild(controlsDiv);
      })();
    `);
  }

  /**
   * Close meet window
   */
  close() {
    if (this.meetWindow && !this.meetWindow.isDestroyed()) {
      this.meetWindow.close();
      this.meetWindow = null;
    }
  }

  /**
   * Get window instance
   */
  getWindow() {
    return this.meetWindow;
  }
}

module.exports = { MeetHandler };