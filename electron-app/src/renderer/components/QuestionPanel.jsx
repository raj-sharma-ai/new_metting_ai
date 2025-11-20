import React, { useState } from 'react';

const QuestionPanel = ({ meetingId }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) {
      alert('Please enter a question');
      return;
    }

    try {
      setLoading(true);
      const result = await window.electron.askQuestion(meetingId, question);
      if (result.success) {
        setAnswer(result.answer);
        setContext(result.context);
      } else {
        alert(result.error || 'Failed to get answer');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="question-panel">
      <h3>💬 Ask a question</h3>
      <p>Need clarification? Ask anything about this meeting transcript.</p>
      <textarea
        placeholder="What were the action items?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <button 
        className="btn-refresh"
        onClick={handleAsk}
        disabled={loading}
      >
        {loading ? 'Thinking...' : 'Ask AI'}
      </button>

      {answer && (
        <div className="answer-box">
          <strong>Answer:</strong>
          <p>{answer}</p>
        </div>
      )}

      {context && (
        <div className="context-box">
          <strong>Context:</strong>
          <p>{context}</p>
        </div>
      )}
    </div>
  );
};

export default QuestionPanel;

