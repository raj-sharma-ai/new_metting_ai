import React from 'react';

const MeetingList = ({ meetings, onSelect, onDownload, onDelete }) => {
  if (!meetings || meetings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📭</div>
        <h3>No meetings yet</h3>
        <p>Start recording to build your knowledge base</p>
      </div>
    );
  }

  return (
    <div className="meeting-list">
      {meetings.map((meeting) => (
        <div key={meeting.meeting_id} className="meeting-card">
          <div className="meeting-card-header">
            <div>
              <h3>{meeting.title || 'Untitled Meeting'}</h3>
              <p>
                {new Date(meeting.created_at).toLocaleString()} • {meeting.duration}
              </p>
            </div>
            <div className="meeting-stats">
              <span>{meeting.speakers?.length || 0} speakers</span>
            </div>
          </div>
          {meeting.summary && (
            <p className="meeting-preview">
              {typeof meeting.summary === 'string'
                ? meeting.summary.slice(0, 180)
                : meeting.summary?.overview?.slice(0, 180)}
              ...
            </p>
          )}
          <div className="meeting-card-actions">
            <button onClick={() => onSelect(meeting.meeting_id)} className="btn-view">
              👁️ View
            </button>
            <button onClick={() => onDownload(meeting.meeting_id)} className="btn-download-small">
              📥 PDF
            </button>
            <button onClick={() => onDelete(meeting.meeting_id)} className="btn-delete">
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MeetingList;
