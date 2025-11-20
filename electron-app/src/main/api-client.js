// api-client.js - Backend Communication Module
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');

class APIClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Connect to WebSocket for live transcription
   * @param {string} meetingId - Meeting identifier
   * @param {Function} onMessage - Callback for transcript updates
   */
  connectWebSocket(meetingId, onMessage) {
    const wsUrl = this.baseUrl.replace('http', 'ws') + `/ws/stream/${meetingId}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (onMessage) {
          onMessage(message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('WebSocket closed');
      
      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
        setTimeout(() => {
          this.connectWebSocket(meetingId, onMessage);
        }, 2000 * this.reconnectAttempts);
      }
    });
  }

  /**
   * Stream audio chunk to backend via WebSocket
   * @param {string} meetingId - Meeting identifier
   * @param {Buffer|Uint8Array} audioChunk - Audio data
   */
  streamAudioChunk(meetingId, audioChunk) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Send binary audio data
        this.ws.send(audioChunk, { binary: true });
      } catch (error) {
        console.error('Error sending audio chunk:', error);
      }
    } else {
      console.warn('WebSocket not connected. Buffering chunk...');
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Upload audio file for transcription
   * @param {string} filePath - Path to audio file
   * @param {string} meetingTitle - Optional meeting title
   */
  async uploadAudioFile(filePath, meetingTitle = 'Untitled Meeting') {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('meeting_title', meetingTitle);

      const response = await this.httpClient.post('/api/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return response.data;
    } catch (error) {
      console.error('Upload error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || 'Upload failed');
    }
  }

  /**
   * Get list of meetings
   * @param {number} limit - Number of meetings to fetch
   */
  async getMeetings(limit = 20) {
    try {
      const response = await this.httpClient.get('/api/meetings', {
        params: { limit }
      });
      return response.data.meetings;
    } catch (error) {
      console.error('Error fetching meetings:', error);
      throw error;
    }
  }

  /**
   * Get meeting details
   * @param {string} meetingId - Meeting identifier
   */
  async getMeetingDetails(meetingId) {
    try {
      const response = await this.httpClient.get(`/api/meeting/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching meeting details:', error);
      throw error;
    }
  }

  /**
   * Ask question about meeting
   * @param {string} meetingId - Meeting identifier
   * @param {string} question - Question text
   */
  async askQuestion(meetingId, question) {
    try {
      const response = await this.httpClient.post('/api/question', {
        meeting_id: meetingId,
        question: question
      });
      return response.data;
    } catch (error) {
      console.error('Error asking question:', error);
      throw error;
    }
  }

  /**
   * Download PDF report
   * @param {string} meetingId - Meeting identifier
   * @param {string} savePath - Path to save file
   */
  async downloadReport(meetingId, savePath) {
    try {
      const response = await this.httpClient.get(`/api/download/${meetingId}`, {
        responseType: 'arraybuffer'
      });

      fs.writeFileSync(savePath, response.data);
      console.log(`✅ Report saved to ${savePath}`);
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  /**
   * Delete meeting
   * @param {string} meetingId - Meeting identifier
   */
  async deleteMeeting(meetingId) {
    try {
      const response = await this.httpClient.delete(`/api/meeting/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error('Delete error:', error);
      throw error;
    }
  }

  /**
   * Finalize meeting and get summary
   * @param {string} meetingId - Meeting identifier
   */
  async finalizeMeeting(meetingId) {
    try {
      // Use the finalize endpoint which generates summary and PDF
      const response = await this.httpClient.post(`/api/finalize-meeting/${meetingId}`);
      return response.data.summary || 'Summary unavailable';
    } catch (error) {
      // If meeting doesn't exist (404), it means no audio was processed yet
      if (error.response?.status === 404) {
        console.warn(`⚠️ Meeting ${meetingId} not found in database. No audio chunks were processed.`);
        return 'No transcript available - recording may have been too short or no audio was captured.';
      }
      console.error('Error finalizing meeting:', error);
      return 'Summary unavailable';
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.httpClient.get('/');
      return response.data;
    } catch (error) {
      throw new Error('Backend not reachable');
    }
  }

  /**
   * Test backend connection
   */
  async testConnection() {
    try {
      await this.healthCheck();
      return { success: true, message: 'Backend connected' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = { APIClient };