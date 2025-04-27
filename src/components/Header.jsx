import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Header = ({ toggleSidebar, isMobile }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isLoggedIn = !!user;

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim(); // Trim whitespace
    if (trimmedQuery) {
      // Navigate to the search results page with the trimmed query
      navigate(`/search?query=${encodeURIComponent(trimmedQuery)}`);
      setSearchQuery(''); // Clear search input after submit
    }
  };

  return (
    <header className="header">
      <div className="header-start">
        {/* Menu button for toggling sidebar */}
        <button className="menu-button icon-button" onClick={toggleSidebar} aria-label="Toggle Sidebar">
          <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
          </svg>
        </button>
        {/* Logo linking to home */}
        <Link to="/" className="logo" aria-label="YouTube Home">
          {/* Replace SVG with Text */}
          <span className="logo-text">Supatube</span>
        </Link>
      </div>

      {/* Search form */}
      <form className="search-form" onSubmit={handleSearch}>
        <input
          className="search-input"
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search"
        />
        <button className="search-button" type="submit" aria-label="Perform Search">
          <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
            <path d="M20.87,20.17l-5.59-5.59C16.35,13.35,17,11.75,17,10c0-3.87-3.13-7-7-7s-7,3.13-7,7s3.13,7,7,7c1.75,0,3.35-0.65,4.58-1.71 l5.59,5.59L20.87,20.17z M10,16c-3.31,0-6-2.69-6-6s2.69-6,6-6s6,2.69,6,6S13.31,16,10,16z"></path>
          </svg>
        </button>
      </form>

      {/* Header end section: Upload, Notifications, Avatar/Sign-in */}
      <div className="header-end">
        {isLoggedIn ? (
          <>
            {/* Upload Button (visible if logged in) */}
            <Link to="/upload" className="icon-button upload-button" aria-label="Upload Video">
              <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
                <path d="M14,13h-3v3H9v-3H6v-2h3V8h2v3h3V13z M17,6H3v12h14v-6.39l4,1.83V8.56l-4,1.83V6 M18,5v3.83L22,7v8l-4-1.83V19H2V5H18L18,5 z"></path>
              </svg>
            </Link>
            
            {/* User Avatar (visible if logged in) */}
            <div className="user-avatar">
              <div className="avatar-dropdown">
                <Link to="/account" aria-label="Account Settings">
                  <img
                    src={user?.profileImageUrl || `https://cloud.appwrite.io/v1/avatars/initials?name=${encodeURIComponent(user?.name || user?.email || 'User')}`}
                    alt="User avatar"
                    className="avatar-img"
                  />
                </Link>
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <img 
                      src={user?.profileImageUrl || `https://cloud.appwrite.io/v1/avatars/initials?name=${encodeURIComponent(user?.name || user?.email || 'User')}`}
                      alt="User" 
                      className="dropdown-avatar" 
                    />
                    <div className="user-info">
                      <span className="user-name">{user?.name || 'User'}</span>
                      <span className="user-email">{user?.email}</span>
                    </div>
                  </div>
                  <div className="dropdown-divider"></div>
                  <Link to={`/profile/${user?.$id}`} className="dropdown-item">Your channel</Link>
                  <Link to="/your-videos" className="dropdown-item">Your videos</Link>
                  <Link to="/account" className="dropdown-item">Account Settings</Link>
                  <div className="dropdown-divider"></div>
                  <button onClick={logout} className="dropdown-item">Sign out</button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Sign In Button (visible if not logged in) */
          <Link to="/sign-in" className="sign-in-button">
            <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
              <path d="M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,3c4.96,0,9,4.04,9,9 c0,1.42-0.34,2.76-0.93,3.96c-1.53-1.72-3.98-2.89-7.38-3.03C14.57,12.6,16,10.97,16,9c0-2.21-1.79-4-4-4C9.79,5,8,6.79,8,9 c0,1.97,1.43,3.6,3.31,3.93c-3.4,0.14-5.85,1.31-7.38,3.03C3.34,14.76,3,13.42,3,12C3,7.04,7.04,3,12,3z M9,9c0-1.65,1.35-3,3-3 s3,1.35,3,3c0,1.65-1.35,3-3,3S9,10.65,9,9z M12,21c-3.16,0-5.94-1.64-7.55-4.12C6.01,14.93,8.61,13.9,12,13.9 c3.39,0,5.99,1.03,7.55,2.98C17.94,19.36,15.16,21,12,21z"></path>
            </svg>
            <span>Sign in</span>
          </Link>
        )}
      </div>
      {/* Inline styles using styled-jsx */}
      <style jsx>{`
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: var(--header-height);
          background-color: var(--white);
          display: flex;
          align-items: center;
          padding: 0 16px;
          justify-content: space-between;
          z-index: 1000; /* Ensure header is above sidebar */
          border-bottom: 1px solid var(--light-gray); /* Subtle border */
        }

        .header-start, .header-end {
          display: flex;
          align-items: center;
          gap: 8px; /* Gap between items */
        }

        .icon-button {
          padding: 8px;
          border-radius: 50%;
          display: flex; /* Ensure SVG is centered */
          align-items: center;
          justify-content: center;
        }
        .icon-button:hover {
          background-color: var(--light-gray);
        }

        .menu-button {
          margin-right: 8px; /* Adjust spacing */
        }

        .logo {
          display: flex; /* Ensure SVG is aligned */
          align-items: center;
          padding: 8px 0; /* Vertical padding for click area */
        }

        /* Style for the text logo */
        .logo-text {
            font-size: 22px; /* Adjust size as needed */
            font-weight: 700; /* Make it bold */
            color: var(--primary); /* Use primary color */
        }

        .search-form {
          flex: 0 1 728px; /* Allow growth, base size, max width */
          display: flex;
          height: 40px;
          margin: 0 40px; /* Add horizontal margin */
        }

        .search-input {
          flex: 1;
          min-width: 100px; /* Prevent extreme collapse */
          padding: 0 16px;
          border: 1px solid #ccc; /* Lighter border */
          border-right: none;
          border-radius: 20px 0 0 20px;
          font-size: 16px;
          outline: none;
          height: 100%; /* Fill height */
        }
        .search-input:focus {
            border-color: #aaa; /* Slightly darken border on focus */
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); /* Inner shadow */
        }

        .search-button {
          background-color: var(--light-gray);
          border: 1px solid #ccc; /* Lighter border */
          border-left: 1px solid transparent; /* Visually merge with input */
          border-radius: 0 20px 20px 0;
          width: 64px;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%; /* Fill height */
          color: var(--text-secondary);
        }
        .search-button:hover {
            background-color: #e0e0e0; /* Darken on hover */
            border-color: #bbb;
        }

        .sign-in-button {
          display: flex;
          align-items: center;
          border: 1px solid #ccc; /* Lighter border */
          color: var(--primary);
          border-radius: 18px;
          padding: 5px 11px; /* Adjusted padding */
          font-weight: 500;
          font-size: 14px; /* Slightly smaller font */
          gap: 6px;
          transition: background-color 0.2s;
        }
        .sign-in-button:hover {
            background-color: #fff0f0; /* Very light red background */
            border-color: #aaa;
        }
        .sign-in-button svg {
            fill: var(--primary);
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          overflow: hidden;
          cursor: pointer; /* Indicate clickable */
          position: relative;
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .avatar-dropdown {
          position: relative;
        }
        
        .avatar-dropdown:hover .dropdown-menu {
          display: block;
        }
        
        .dropdown-menu {
          display: none;
          position: absolute;
          right: 0;
          top: 40px;
          min-width: 240px;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 1000;
          overflow: hidden;
        }
        
        .dropdown-header {
          padding: 16px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid #eee;
        }
        
        .dropdown-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          margin-right: 12px;
        }
        
        .user-info {
          display: flex;
          flex-direction: column;
        }
        
        .user-name {
          font-weight: 500;
        }
        
        .user-email {
          font-size: 14px;
          color: #606060;
        }
        
        .dropdown-divider {
          height: 1px;
          background-color: #eee;
        }
        
        .dropdown-item {
          padding: 12px 16px;
          display: block;
          text-decoration: none;
          color: #030303;
          font-size: 14px;
          cursor: pointer;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
        }
        
        .dropdown-item:hover {
          background-color: #f2f2f2;
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .search-form {
            flex: 1; /* Take available space */
            margin: 0 16px; /* Reduce margin */
          }
          .logo {
              display: none; /* Hide logo text on smaller screens */
          }
          .upload-button {
              display: none; /* Hide upload button on mobile header */
          }
        }

        @media (max-width: 576px) {
          .search-form {
            /* Optionally hide search or replace with icon button */
            display: none;
          }
          .header {
            padding: 0 8px; /* Reduce padding */
          }
           .header-end {
              gap: 4px; /* Reduce gap */
           }
           .sign-in-button {
               padding: 4px 8px;
               font-size: 13px;
           }
           .sign-in-button span {
               display: none; /* Hide "Sign in" text */
           }
        }
      `}</style>
    </header>
  );
};

export default Header;
