const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const expose = {
  startRecording: (meetUrl, title) => invoke('start-recording', meetUrl, title),
  stopRecording: () => invoke('stop-recording'),
  getMeetings: () => invoke('get-meetings'),
  getMeetingDetails: (meetingId) => invoke('get-meeting-details', meetingId),
  downloadReport: (meetingId) => invoke('download-report', meetingId),
  deleteMeeting: (meetingId) => invoke('delete-meeting', meetingId),
  askQuestion: (meetingId, question) => invoke('ask-question', meetingId, question),
  checkAudioDevices: () => invoke('check-audio-devices'),
  onTranscriptUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('transcript-update', handler);
    return () => ipcRenderer.removeListener('transcript-update', handler);
  },
  onMeetingCompleted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('meeting-completed', handler);
    return () => ipcRenderer.removeListener('meeting-completed', handler);
  },
  removeListeners: () => {
    ipcRenderer.removeAllListeners('transcript-update');
    ipcRenderer.removeAllListeners('meeting-completed');
  }
};

contextBridge.exposeInMainWorld('electron', expose);
