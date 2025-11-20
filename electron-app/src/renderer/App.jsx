// App.jsx - Main React Application
import React, { useState, useEffect } from 'react';
import RecordControls from './components/RecordControls';
import MeetingList from './components/MeetingList';
import TranscriptViewer from './components/TranscriptViewer';
import SummaryPanel from './components/SummaryPanel';
import QuestionPanel from './components/QuestionPanel';

function App() {
  const [recording, setRecording] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [activeTab, setActiveTab] = useState('record'); // record, history, view

  // Load meetings on mount
  useEffect(() => {
    loadMeetings();
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (!window.electron) {
      console.error('Electron preload not found');
      return;
    }
    
    const unsubscribeTranscript = window.electron.onTranscriptUpdate((data) => {
      if (data?.type === 'partial_transcript') {
        setLiveTranscript(prev => [...prev, ...data.speakers]);
      }
    });

    const unsubscribeMeeting = window.electron.onMeetingCompleted(() => {
      setRecording(false);
      setCurrentMeetingId(null);
      loadMeetings();
      
      if (Notification.permission === 'granted') {
        new Notification('Meeting Recorded', {
          body: 'Your meeting has been transcribed and summarized!'
        });
      }
    });

    return () => {
      unsubscribeTranscript?.();
      unsubscribeMeeting?.();
      window.electron.removeListeners?.();
    };
  }, []);

  const loadMeetings = async () => {
    try {
      const result = await window.electron.getMeetings();
      if (result.success) {
        setMeetings(result.meetings);
      }
    } catch (error) {
      console.error('Error loading meetings:', error);
    }
  };

  const handleStartRecording = async (meetUrl, meetingTitle) => {
    try {
      const result = await window.electron.startRecording(meetUrl, meetingTitle);
      
      if (result.success) {
        setRecording(true);
        setCurrentMeetingId(result.meetingId);
        setLiveTranscript([]);
        setActiveTab('record');
      } else {
        alert('Failed to start recording: ' + result.error);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleStopRecording = async () => {
    try {
      const result = await window.electron.stopRecording();
      
      if (result.success) {
        setRecording(false);
        setCurrentMeetingId(null);
        loadMeetings();
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleSelectMeeting = async (meetingId) => {
    try {
      const result = await window.electron.getMeetingDetails(meetingId);
      
      if (result.success) {
        setSelectedMeeting(result.meeting);
        setActiveTab('view');
      }
    } catch (error) {
      alert('Error loading meeting: ' + error.message);
    }
  };

  const handleDownloadReport = async (meetingId) => {
    try {
      const result = await window.electron.downloadReport(meetingId);
      
      if (result.success) {
        alert(`Report saved to: ${result.path}`);
      }
    } catch (error) {
      alert('Error downloading report: ' + error.message);
    }
  };

  const handleDeleteMeeting = async (meetingId) => {
    if (!confirm('Are you sure you want to delete this meeting?')) {
      return;
    }

    try {
      const result = await window.electron.deleteMeeting(meetingId);
      
      if (result.success) {
        loadMeetings();
        if (selectedMeeting?.meeting_id === meetingId) {
          setSelectedMeeting(null);
          setActiveTab('history');
        }
      }
    } catch (error) {
      alert('Error deleting meeting: ' + error.message);
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>🎙️ Google Meet Recorder</h1>
          {recording && (
            <div className="recording-badge">
              <span className="recording-dot"></span>
              Recording in Progress
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav className="app-nav">
        <button 
          className={activeTab === 'record' ? 'active' : ''}
          onClick={() => setActiveTab('record')}
        >
          🔴 Record
        </button>
        <button 
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          📚 History
        </button>
        {selectedMeeting && (
          <button 
            className={activeTab === 'view' ? 'active' : ''}
            onClick={() => setActiveTab('view')}
          >
            👁️ View Meeting
          </button>
        )}
      </nav>

      {/* Main Content */}
      <main className="app-main">
        {activeTab === 'record' && (
          <div className="record-view">
            <RecordControls
              recording={recording}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
            />
            
            {recording && (
              <div className="live-view">
                <h2>Live Transcript</h2>
                <TranscriptViewer 
                  transcript={liveTranscript}
                  isLive={true}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-view">
            <div className="history-header">
              <h2>Meeting History</h2>
              <button 
                className="btn-refresh"
                onClick={loadMeetings}
              >
                🔄 Refresh
              </button>
            </div>
            <MeetingList
              meetings={meetings}
              onSelect={handleSelectMeeting}
              onDownload={handleDownloadReport}
              onDelete={handleDeleteMeeting}
            />
          </div>
        )}

        {activeTab === 'view' && selectedMeeting && (
          <div className="meeting-view">
            <div className="meeting-header">
              <div>
                <h2>{selectedMeeting.title}</h2>
                <p className="meeting-meta">
                  {new Date(selectedMeeting.created_at).toLocaleString()} • 
                  {selectedMeeting.duration}
                </p>
              </div>
              <div className="meeting-actions">
                <button 
                  className="btn-download"
                  onClick={() => handleDownloadReport(selectedMeeting.meeting_id)}
                >
                  📥 Download PDF
                </button>
                <button 
                  className="btn-close"
                  onClick={() => {
                    setSelectedMeeting(null);
                    setActiveTab('history');
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="meeting-content">
              <div className="content-left">
                <SummaryPanel summary={selectedMeeting.summary} />
                <QuestionPanel meetingId={selectedMeeting.meeting_id} />
              </div>
              <div className="content-right">
                <TranscriptViewer 
                  transcript={selectedMeeting.speakers}
                  isLive={false}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Made with ❤️ using Electron + FastAPI + AssemblyAI</p>
      </footer>
    </div>
  );
}

export default App;