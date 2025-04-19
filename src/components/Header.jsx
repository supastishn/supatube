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
    if (searchQuery.trim()) {
      // TODO: Implement actual search functionality
      console.log('Searching for:', searchQuery);
      // Example navigation (implement search results page later)
      // navigate(`/search?query=${encodeURIComponent(searchQuery)}`);
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
          {/* SVG Logo (same as before) */}
          <svg viewBox="0 0 90 20" height="20" width="90">
            <g><path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z" fill="#FF0000"></path><path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="white"></path></g>
            {/* Text part of logo (same as before) */}
            <g><g><path d="M34.6024 13.0036L31.3945 1.41846H34.1932L35.3174 6.6701C35.6043 7.96361 35.8136 9.06662 35.95 9.97913H36.0323C36.1264 9.32532 36.3381 8.22937 36.665 6.68892L37.8291 1.41846H40.6278L37.3799 13.0036V18.561H34.6001V13.0036H34.6024Z"></path><path d="M41.4697 18.1937C40.9053 17.8127 40.5031 17.22 40.2632 16.4157C40.0257 15.6114 39.9058 14.5437 39.9058 13.2078V11.3898C39.9058 10.0422 40.0422 8.95805 40.315 8.14196C40.5878 7.32588 41.0135 6.72851 41.592 6.35457C42.1706 5.98063 42.9302 5.79248 43.871 5.79248C44.7976 5.79248 45.5384 5.98298 46.0981 6.36398C46.6555 6.74497 47.0647 7.34234 47.3234 8.15137C47.5821 8.96275 47.7115 10.0422 47.7115 11.3898V13.2078C47.7115 14.5437 47.5845 15.6161 47.3329 16.4251C47.0812 17.2365 46.672 17.8292 46.1075 18.2031C45.5431 18.5771 44.7764 18.7652 43.8098 18.7652C42.8126 18.7675 42.0342 18.5747 41.4697 18.1937ZM44.6353 16.2323C44.7905 15.8231 44.8705 15.1575 44.8705 14.2309V10.3292C44.8705 9.43077 44.7929 8.77225 44.6353 8.35833C44.4777 7.94206 44.2026 7.7351 43.8074 7.7351C43.4265 7.7351 43.156 7.94206 43.0008 8.35833C42.8432 8.77461 42.7656 9.43077 42.7656 10.3292V14.2309C42.7656 15.1575 42.8408 15.8254 42.9914 16.2323C43.1419 16.6415 43.4123 16.8461 43.8074 16.8461C44.2026 16.8461 44.4777 16.6415 44.6353 16.2323Z"></path><path d="M56.8154 18.5634H54.6094L54.3648 17.03H54.2827C53.7414 18.1871 52.8118 18.7656 51.4946 18.7656C50.6765 18.7656 50.0643 18.4928 49.6544 17.9496C49.2445 17.4039 49.0389 16.5526 49.0389 15.3955V6.03751H51.91V15.2308C51.91 15.7906 51.9688 16.188 52.0867 16.4256C52.2022 16.6631 52.4119 16.7819 52.7096 16.7819C53.0829 16.7819 53.3722 16.6466 53.5763 16.3759C53.7805 16.1052 53.8822 15.7597 53.8822 15.3385V6.03516H56.7533V18.5634H56.8154Z"></path><path d="M64.4755 3.68758H61.6768V18.5629H58.9181V3.68758H56.1194V1.42041H64.4755V3.68758Z"></path><path d="M71.2768 18.5634H69.0708L68.8262 17.03H68.7441C68.203 18.1871 67.2733 18.7656 65.9562 18.7656C65.1379 18.7656 64.5259 18.4928 64.1159 17.9496C63.7061 17.4039 63.5005 16.5526 63.5005 15.3955V6.03751H66.3715V15.2308C66.3715 15.7906 66.4303 16.188 66.5482 16.4256C66.6637 16.6631 66.8734 16.7819 67.1711 16.7819C67.5444 16.7819 67.8337 16.6466 68.0379 16.3759C68.242 16.1052 68.3439 15.7597 68.3439 15.3385V6.03516H71.2149V18.5634H71.2768Z"></path><path d="M80.609 8.0387C80.4373 7.24849 80.1621 6.67699 79.7812 6.32186C79.4002 5.96674 78.8757 5.79035 78.2078 5.79035C77.6904 5.79035 77.2059 5.93616 76.7567 6.23014C76.3075 6.52412 75.9594 6.90747 75.7148 7.38489H75.6937V0.785645H72.9773V18.5608H75.3056L75.5925 17.3755H75.6537C75.8724 17.7988 76.1993 18.1304 76.6344 18.3774C77.0695 18.622 77.554 18.7443 78.0855 18.7443C79.038 18.7443 79.7412 18.3045 80.1904 17.4272C80.6396 16.5476 80.8653 15.1765 80.8653 13.3092V11.3266C80.8653 9.92722 80.7783 8.82892 80.609 8.0387ZM78.0243 13.1492C78.0243 14.0617 77.9867 14.7767 77.9114 15.2941C77.8362 15.8115 77.7115 16.1808 77.5328 16.3971C77.3564 16.6158 77.1165 16.724 76.8178 16.724C76.585 16.724 76.371 16.6699 76.1734 16.5594C75.9759 16.4512 75.816 16.2866 75.6937 16.0702V8.96062C75.7877 8.6196 75.9524 8.34209 76.1852 8.12337C76.4157 7.90465 76.6697 7.79646 76.9401 7.79646C77.2271 7.79646 77.4481 7.90935 77.6034 8.13278C77.7609 8.35855 77.8691 8.73485 77.9303 9.26636C77.9914 9.79787 78.022 10.5528 78.022 11.5335V13.1492H78.0243Z"></path><path d="M84.8657 13.8712C84.8657 14.6755 84.8892 15.2776 84.9363 15.6798C84.9833 16.0819 85.0821 16.3736 85.2326 16.5594C85.3831 16.7428 85.6136 16.8345 85.9264 16.8345C86.3474 16.8345 86.639 16.6699 86.802 16.343C86.9649 16.0161 87.0497 15.4705 87.0568 14.7085L89.4886 14.8519C89.5024 14.9601 89.5071 15.1106 89.5071 15.3011C89.5071 16.4582 89.186 17.3237 88.5438 17.8952C87.9016 18.4667 87.0355 18.7536 85.9457 18.7536C84.6173 18.7536 83.6819 18.3185 83.1397 17.4461C82.5975 16.5738 82.3245 15.1336 82.3245 13.1335V11.3475C82.3245 9.33923 82.6046 7.89588 83.1646 7.0169C83.7246 6.13793 84.6795 5.69993 86.0295 5.69993C86.8008 5.69993 87.4379 5.85181 87.9426 6.15388C88.4474 6.45594 88.8255 6.92683 89.0783 7.56403C89.3311 8.20264 89.4576 9.04715 89.4576 10.0958V12.1782H84.8657V13.8712ZM85.2232 7.96811C85.0797 8.14449 84.9857 8.43377 84.9363 8.83593C84.8892 9.2381 84.8657 9.84722 84.8657 10.6657V10.7232H86.9283V10.6657C86.9283 9.86133 86.9001 9.25221 86.846 8.83593C86.7919 8.41966 86.6931 8.12803 86.5496 7.95635C86.4062 7.78702 86.1851 7.7 85.8864 7.7C85.5854 7.70235 85.3643 7.79172 85.2232 7.96811Z"></path></g></g>
          </svg>
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
                <img
                  src={`https://cloud.appwrite.io/v1/avatars/initials?name=${encodeURIComponent(user?.name || user?.email || 'User')}`}
                  alt="User avatar"
                  className="avatar-img"
                />
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <img 
                      src={`https://cloud.appwrite.io/v1/avatars/initials?name=${encodeURIComponent(user?.name || user?.email || 'User')}`} 
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
