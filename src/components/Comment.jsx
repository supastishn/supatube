import React from 'react';
import { Link } from 'react-router-dom';
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

const Comment = ({ comment }) => {
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
        {/* TODO: Add Reply button and interaction logic here */}
        {/* <div className="comment-actions">
          <button className="reply-button">Reply</button>
        </div> */}

        {/* Render Replies Recursively (if any) */}
        {replies.length > 0 && (
          <div className="comment-replies">
            {replies.map(reply => (
              <Comment key={reply.commentId} comment={reply} />
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
          .comment-replies {
            margin-top: 12px;
            padding-left: 0px; /* Adjust indentation for replies if desired */
            /* border-left: 2px solid var(--light-gray); */ /* Optional visual indicator */
          }
       `}</style>
    </div>
  );
};

export default Comment;
