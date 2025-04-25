import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { postComment } from '../lib/commentService';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';

// Helper function to format date (e.g., 2 weeks ago) - Can be moved to utils
const formatTimeAgo = (dateString) => {
  if (!dateString) return "some time ago";
  try {
    return formatDistanceToNowStrict(parseISO(dateString), { addSuffix: true });
  } catch (e) {
    return "some time ago";
  }
};

const Comment = ({ comment, videoId, onReplyPosted, depth = 0 }) => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  const handlePostReply = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      // Redirect to sign-in, passing the current video page as the return path
      navigate('/sign-in', { state: { from: { pathname: `/videos/${videoId}` } } });
      return;
    }
    const trimmedReply = replyText.trim();
    if (!trimmedReply || isPostingReply) {
      return;
    }

    setIsPostingReply(true);
    setReplyError('');

    try {
      // Call the service, passing the CURRENT comment's ID as the parent
      await postComment(videoId, trimmedReply, comment.commentId);
      setReplyText(''); // Clear input
      setShowReplyInput(false); // Hide input form
      if (onReplyPosted) {
        onReplyPosted(); // Trigger refresh in parent (VideoDetail)
      }
    } catch (error) {
      console.error("Failed to post reply:", error);
      setReplyError(error.message || "Failed to post reply.");
    } finally {
      setIsPostingReply(false);
    }
  };
  const {
    commentId,
    userId,
    userName,
    userAvatarUrl,
    commentText,
    timestamp,
    replies = [] // Default replies to empty array
  } = comment;

  // TODO: Add state and handler for showing/posting replies in Phase 2

  return (
    <div className="comment-item" id={`comment-${commentId}`}>
      <Link to={`/profile/${userId}`} className="comment-avatar-link">
        <img
          src={userAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || '?')}&background=random`}
          alt={`${userName || 'User'}'s avatar`}
          className="comment-avatar"
          loading="lazy"
        />
      </Link>
      <div className="comment-content">
        <div className="comment-header">
          <Link to={`/profile/${userId}`} className="comment-author-name">{userName || 'User'}</Link>
          <span className="comment-timestamp">{formatTimeAgo(timestamp)}</span>
        </div>
        <p className="comment-text">{commentText}</p>
        {/* Comment Actions */}
        <div className="comment-actions">
          {currentUser && depth === 0 && ( // Only show reply button if logged in and top-level comment
            <button className="reply-button" onClick={() => setShowReplyInput(!showReplyInput)}>
              Reply
            </button>
          )}
        </div>

        {/* Reply Input Form */}
        {depth === 0 && showReplyInput && (
          <form onSubmit={handlePostReply} className="reply-form">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Replying to ${userName || 'User'}...`}
              rows="2"
              required
              maxLength={2000} // Consistent limit
              disabled={isPostingReply}
            />
            {replyError && <p className="form-error reply-error">{replyError}</p>}
            <div className="reply-form-buttons">
              <button type="button" className="btn-secondary" onClick={() => {setShowReplyInput(false); setReplyText(''); setReplyError('');}} disabled={isPostingReply}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isPostingReply || !replyText.trim()}>
                {isPostingReply ? 'Replying...' : 'Reply'}
              </button>
            </div>
          </form>
        )}

        {/* Render Replies Recursively (if any) */}
        {replies.length > 0 && (
          <div className="comment-replies">
            {replies.map(reply => (
              <Comment
                key={reply.commentId}
                comment={reply}
                videoId={videoId} // Pass props down
                onReplyPosted={onReplyPosted} // Pass props down
                depth={depth + 1} // Increment depth for replies
              />
            ))}
          </div>
        )}
      </div>
       <style jsx>{`
          .comment-item {
            display: flex;
            gap: 12px;
            margin-bottom: 16px; /* Space below each comment */
          }
          .comment-avatar-link {
            flex-shrink: 0;
          }
          .comment-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
          }
          .comment-content {
            flex-grow: 1;
            min-width: 0; /* Prevent overflow */
          }
          .comment-header {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 4px;
          }
          .comment-author-name {
            font-weight: 500;
            font-size: 13px;
            color: var(--text);
            text-decoration: none;
          }
          .comment-author-name:hover {
            text-decoration: underline;
          }
          .comment-timestamp {
            font-size: 12px;
            color: var(--text-secondary);
          }
          .comment-text {
            font-size: 14px;
            line-height: 1.5;
            white-space: pre-wrap; /* Preserve line breaks */
            word-break: break-word; /* Break long words */
            color: var(--text);
          }
          .comment-actions {
            margin-top: 8px;
          }
          .reply-button {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary);
            padding: 6px 0; /* Adjust padding */
          }
          .reply-button:hover {
            color: var(--text);
          }

          .reply-form {
            margin-top: 10px;
            margin-left: 0; /* Replies form aligns with parent comment */
          }
          .reply-form textarea {
             width: 100%;
             padding: 8px;
             border: 1px solid var(--border-color, #ccc);
             border-radius: 4px;
             font-size: 13px;
             resize: vertical;
             min-height: 40px;
             margin-bottom: 8px;
          }
          .reply-form-buttons {
             display: flex;
             justify-content: flex-end;
             gap: 8px;
          }
          .reply-form button {
             padding: 6px 12px;
             font-size: 13px;
             border-radius: 18px;
          }
          .reply-error {
            font-size: 12px;
            margin-bottom: 5px;
          }

          .comment-replies {
            margin-top: 12px;
            padding-left: 52px; /* Indent replies (avatar width + gap) */
            /* border-left: 2px solid var(--light-gray); */ /* Optional visual indicator */
          }
       `}</style>
    </div>
  );
};

export default Comment;
