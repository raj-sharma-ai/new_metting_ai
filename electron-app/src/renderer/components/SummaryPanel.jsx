import React from 'react';

const SummaryPanel = ({ summary }) => {
  if (!summary) {
    return (
      <div className="summary-panel">
        <h3>📊 Summary</h3>
        <p className="no-data">No summary available</p>
      </div>
    );
  }

  return (
    <div className="summary-panel">
      <h3>📊 Meeting Summary</h3>

      {summary.overview && (
        <div className="summary-section">
          <h4>Overview</h4>
          <p>{summary.overview}</p>
        </div>
      )}

      {summary.key_points && summary.key_points.length > 0 && (
        <div className="summary-section">
          <h4>Key Points</h4>
          <ul className="key-points-list">
            {summary.key_points.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.action_items && summary.action_items.length > 0 && (
        <div className="summary-section">
          <h4>Action Items</h4>
          <ul className="action-items-list">
            {summary.action_items.map((item, index) => (
              <li key={index}>
                <span className="action-checkbox">☐</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.decisions && summary.decisions.length > 0 && (
        <div className="summary-section">
          <h4>Decisions Made</h4>
          <ul className="decisions-list">
            {summary.decisions.map((decision, index) => (
              <li key={index}>
                <span className="decision-icon">✓</span>
                {decision}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;