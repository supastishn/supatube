import React from 'react';
import { Link } from 'react-router-dom';
import { formatViews } from '../utils/formatters'; // Use the existing formatter

const ChannelCard = ({ channel }) => {
  const {
    id,
    name = 'Unknown Channel',
    profileImageUrl = 'https://via.placeholder.com/88?text=?',
    subscriberCount = 0,
    bio = ''
  } = channel || {};

  return (
    <Link to={`/profile/${id}`} className="channel-card-link">
      <div className="channel-card">
        <img
          src={profileImageUrl}
          alt={`${name} avatar`}
          className="channel-card-avatar"
          loading="lazy"
        />
        <div className="channel-card-info">
          <h3 className="channel-card-name">{name}</h3>
          <p className="channel-card-subs">{formatViews(subscriberCount)} subscribers</p>
          {bio && <p className="channel-card-bio">{bio}</p>}
        </div>
        {/* Optional: Add a subscribe button or other actions later */}
      </div>
      <style jsx>{`
        .channel-card-link {
          display: block;
          text-decoration: none;
          color: inherit;
          border-radius: 8px;
          transition: background-color 0.2s;
        }
        .channel-card-link:hover {
          background-color: var(--light-gray);
        }
        .channel-card {
          display: flex;
          align-items: center;
          padding: 16px;
          gap: 16px;
        }
        .channel-card-avatar {
          width: 88px; /* Size for channel card */
          height: 88px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }
        .channel-card-info {
          flex-grow: 1;
          min-width: 0;
        }
        .channel-card-name {
          font-size: 18px;
          font-weight: 500;
          margin-bottom: 4px;
          /* Ellipsis for long names */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .channel-card-subs {
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .channel-card-bio {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.4;
          /* Clamp bio to 2 lines */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: calc(1.4em * 2);
        }
      `}</style>
    </Link>
  );
};

export default ChannelCard;
