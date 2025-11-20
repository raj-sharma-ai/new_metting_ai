import React from 'react';

const formatTime = (seconds) => {
  if (seconds === undefined || seconds === null) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const TranscriptViewer = ({ transcript = [], isLive }) => (
  <div className="transcript-panel">
    <div className="transcript-list">
      {transcript.length === 0 && (
        <p className="no-data">{isLive ? 'Waiting for transcript...' : 'No transcript found'}</p>
      )}
      {transcript.map((segment, index) => (
        <div className="transcript-item" key={`${segment.start}-${index}`}>
          <div className="transcript-header">
            <span className="transcript-speaker">{segment.speaker || 'Speaker'}</span>
            <span className="transcript-time">
              {formatTime(segment.start)} - {formatTime(segment.end)}
            </span>
          </div>
          <p>{segment.text}</p>
        </div>
      ))}
    </div>
  </div>
);

export default TranscriptViewer;

