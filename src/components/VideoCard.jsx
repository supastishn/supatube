import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns'; // For time ago

// Helper function to format duration (e.g., from seconds to M:SS or H:MM:SS)
const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const date = new Date(seconds * 1000);
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  if (hh) {
    return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
  }
  return `${mm}:${ss}`;
};

// Helper function to format view counts (e.g., 1.2M, 10K)
const formatViews = (views) => {
  if (isNaN(views) || views < 0) return '0';
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (views >= 1000) {
    return (views / 1000).toFixed(views >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  }
  return views.toString();
};

// Helper function to format date (e.g., 2 weeks ago)
const formatTimeAgo = (dateString) => {
    try {
        return formatDistanceToNowStrict(new Date(dateString), { addSuffix: true });
    } catch (e) {
        return "some time ago"; // Fallback
    }
}


const VideoCard = ({ video, isRelated = false }) => {
  // Default/Fallback video data structure
  const defaultVideo = {
    id: 'default-video-id',
    title: 'Default Video Title - Check Data Source',
    thumbnailUrl: 'https://via.placeholder.com/320x180/CCCCCC/969696?text=No+Thumbnail', // Placeholder thumbnail
    durationSeconds: 615, // Example duration in seconds (10:15)
    viewCount: 1200000, // Example views
    uploadedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // Example: 2 weeks ago
    channel: {
      id: 'default-channel-id',
      name: 'Default Channel',
      profileImageUrl: 'https://via.placeholder.com/48/CCCCCC/969696?text=C', // Placeholder avatar
    }
  };

  // Use provided video data or fallback to default
  const {
    id,
    title,
    thumbnailUrl,
    durationSeconds,
    viewCount,
    uploadedAt,
    channel
  } = video || defaultVideo;

  const {
      id: channelId, // Rename to avoid conflict with video id
      name, // Channel Name
      profileImageUrl, // Channel Avatar URL
      creatorUserId // Creator's user ID from permissions
  } = channel || defaultVideo.channel;
  
  console.log('VideoCard Channel ID:', channelId);

  // Determine card layout based on context (e.g., grid vs. list/related)
  const cardLayoutClass = isRelated ? 'related-layout' : 'grid-layout';

  return (
    <div className={`video-card ${cardLayoutClass}`}>
      {/* Thumbnail Link */}
      <Link to={`/videos/${id}`} className="thumbnail-container">
        <img
          src={thumbnailUrl}
          alt={title}
          className="video-thumbnail"
          loading="lazy" // Lazy load thumbnails
        />
        <span className="video-duration">{formatDuration(durationSeconds)}</span>
      </Link>

      {/* Video Information Section */}
      <div className="video-info">
        {/* Channel Avatar (only for grid layout) */}
        {!isRelated && (
          <Link to={`/profile/${creatorUserId || 'default-user-id'}`} className="channel-avatar-link" title={name}> {/* Use creatorUserId preferentially */}
             <img
               src={profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=random`}
               alt={`${name || 'Channel'} avatar`}
               className="channel-avatar"
               loading="lazy"
             />
          </Link>
        )}

        {/* Video Text Details */}
        <div className="video-details">
          <Link to={`/videos/${id}`} className="video-title-link" title={title}>
            <h3 className="video-title">{title}</h3>
          </Link>
          <Link to={`/profile/${creatorUserId || 'default-user-id'}`} className="channel-name-link" title={name}> {/* Use creatorUserId preferentially */}
            {name || 'Unknown Channel'}
          </Link>
          <div className="video-stats">
            <span>{formatViews(viewCount)} views</span>
            <span className="dot">•</span>
            <span>{formatTimeAgo(uploadedAt)}</span>
          </div>
        </div>
      </div>
      {/* Inline styles */}
      <style jsx>{`
        .video-card {
          display: flex;
          width: 100%;
          cursor: pointer; /* Indicate clickable area */
        }
        /* Default Grid Layout */
        .video-card.grid-layout {
          flex-direction: column;
        }

        /* Related/List Layout */
        .video-card.related-layout {
          flex-direction: row;
          gap: 8px; /* Gap between thumbnail and info */
          align-items: flex-start; /* Align items to top */
        }

        /* --- Styles for Like/Dislike Buttons --- */

        .video-actions .video-action-btn.like-btn,
        .video-actions .video-action-btn.dislike-btn {
          /* Base styles covered by .video-action-btn */
        }

        .video-actions .video-action-btn.like-btn span {
            margin-left: 4px; /* Space between icon and count */
        }

        /* Active state for like/dislike buttons */
        .video-actions .video-action-btn.active {
          /* Example: Slightly darker background or different visual cue */
          /* background-color: #d9d9d9; */
        }

        /* Style the SVG icon when the button is active */
        .video-actions .video-action-btn.active svg {
          /* Example: Use primary color or specific colors */
          fill: var(--primary); /* Red for liked */
        }
        .video-actions .video-action-btn.dislike-btn.active svg {
          fill: #606060; /* Dark gray for disliked (example) */
        }

        /* Style for disabled state */
        .video-actions .video-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Style for like/dislike error message */
        .like-error-message {
          color: var(--primary, red);
          font-size: 13px;
          margin-top: 8px;
          width: 100%; /* Span full width below actions */
        }

        .thumbnail-container {
          position: relative;
          display: block; /* Ensure it behaves like a block element */
          width: 100%;
          background-color: var(--light-gray); /* Placeholder background */
          border-radius: 12px;
          overflow: hidden;
          flex-shrink: 0; /* Prevent shrinking */
        }
        .video-card.grid-layout .thumbnail-container {
            padding-top: 56.25%; /* 16:9 Aspect Ratio for grid */
            margin-bottom: 12px; /* Space below thumbnail in grid */
        }
        .video-card.related-layout .thumbnail-container {
            width: 168px; /* Fixed width for related */
            height: 94px; /* Fixed height */
            border-radius: 8px; /* Smaller radius for related */
        }

        .video-thumbnail {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.2s ease-in-out; /* Subtle zoom effect */
        }
        .video-card:hover .video-thumbnail {
           transform: scale(1.03); /* Zoom effect on hover */
        }

        .video-duration {
          position: absolute;
          bottom: 6px; /* Adjusted position */
          right: 6px; /* Adjusted position */
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 4px; /* Adjusted padding */
          border-radius: 4px; /* Slightly more rounded */
          font-size: 12px;
          font-weight: 500;
          line-height: 1; /* Ensure consistent height */
        }

        .video-info {
          display: flex;
          gap: 12px; /* Gap between avatar and details */
          flex: 1; /* Take remaining space */
          min-width: 0; /* Crucial for text overflow */
        }
        .video-card.related-layout .video-info {
           padding-top: 0; /* No top padding needed */
           gap: 8px; /* Smaller gap */
        }

        .channel-avatar-link {
           flex-shrink: 0; /* Prevent avatar shrinking */
        }

        .channel-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          background-color: var(--light-gray); /* Placeholder bg */
        }

        .video-details {
          display: flex;
          flex-direction: column;
          flex: 1; /* Take remaining space */
          min-width: 0; /* Crucial for text overflow */
        }

        .video-title-link {
            text-decoration: none;
            color: inherit;
        }

        .video-title {
          font-weight: 500;
          font-size: 16px; /* Grid title size */
          line-height: 1.4;
          margin: 0 0 4px 0; /* Reset margin */
          color: var(--text);
          /* Clamp text to 2 lines */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: calc(1.4em * 2); /* Approximate height for 2 lines */
        }
        .video-card.related-layout .video-title {
            font-size: 14px; /* Smaller title for related */
            line-height: 1.3;
            max-height: calc(1.3em * 2);
            margin-bottom: 2px;
        }

        .channel-name-link {
          color: var(--text-secondary);
          font-size: 14px; /* Grid channel name size */
          line-height: 1.3;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-decoration: none;
        }
        .channel-name-link:hover {
            color: var(--text); /* Darken on hover */
        }
        .video-card.related-layout .channel-name-link {
            font-size: 12px; /* Smaller for related */
            margin-bottom: 2px;
        }

        .video-stats {
          color: var(--text-secondary);
          font-size: 14px; /* Grid stats size */
          line-height: 1.3;
          display: flex;
          align-items: center;
          flex-wrap: wrap; /* Allow wrapping if needed */
          gap: 4px; /* Gap between stats items */
        }
        .video-stats .dot {
            margin: 0 2px; /* Space around dot */
        }
        .video-card.related-layout .video-stats {
            font-size: 12px; /* Smaller for related */
        }
      `}</style>
    </div>
  );
};

export default VideoCard;
