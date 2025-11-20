import React, { useState } from 'react';

// RecordControls.jsx
const RecordControls = ({ recording, onStart, onStop }) => {
  const [meetUrl, setMeetUrl] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');

  const handleStart = () => {
    if (!meetUrl.trim()) {
      alert('Please enter a Google Meet URL');
      return;
    }
    if (!meetingTitle.trim()) {
      alert('Please enter a meeting title');
      return;
    }
    onStart(meetUrl, meetingTitle);
  };

  return (
    <div className="record-controls">
      <div className="control-card">
        <h2>🎙️ Start Recording</h2>
        
        {!recording ? (
          <div className="form-group">
            <div className="input-group">
              <label htmlFor="meetUrl">Google Meet URL</label>
              <input
                id="meetUrl"
                type="text"
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                value={meetUrl}
                onChange={(e) => setMeetUrl(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="input-group">
              <label htmlFor="meetingTitle">Meeting Title</label>
              <input
                id="meetingTitle"
                type="text"
                placeholder="e.g., Team Standup - Nov 18"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                className="input-field"
              />
            </div>

            <button 
              className="btn-start"
              onClick={handleStart}
            >
              🔴 Start Recording
            </button>

            <div className="info-box">
              <p><strong>📌 Instructions:</strong></p>
              <ul>
                <li>Enter the Google Meet URL</li>
                <li>Give your meeting a descriptive title</li>
                <li>Click "Start Recording" to begin</li>
                <li>The app will join the meeting and record audio</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="recording-active">
            <div className="pulse-animation">
              <div className="pulse-dot"></div>
            </div>
            <h3>Recording Active</h3>
            <p>Your meeting is being recorded and transcribed in real-time</p>
            <button 
              className="btn-stop"
              onClick={onStop}
            >
              ⏹️ Stop Recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordControls;