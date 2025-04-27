import { Link, NavLink } from 'react-router-dom';

const Sidebar = ({ isOpen, isMobile, closeSidebar }) => {
  // Menu items definition
  const mainMenu = [
    { icon: 'home', label: 'Home', path: '/' },
    { icon: 'trending', label: 'Trending', path: '/trending' },
    { icon: 'subscriptions', label: 'Subscriptions', path: '/subscriptions' },
  ];

  const libraryMenu = [
    { icon: 'history', label: 'History', path: '/history' },
    { icon: 'yourVideos', label: 'Your videos', path: '/your-videos' },
    { icon: 'watchLater', label: 'Watch later', path: '/playlist?list=WL' },
    { icon: 'likedVideos', label: 'Liked videos', path: '/liked-videos' }, // Corrected path
  ];

  // SVG Path data for icons (Consider moving to a separate file or helper)
  const icons = {
    home: <path d="M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>, // Simple House
    trending: <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>, // Simple Arrow/Line Graph
    subscriptions: <path d="M20 8H4V6h16v2zm-2-6H6v2h12V2zM4 18v-2h16v2H4zm18-7H2v2h20v-2z"/>, // Stack/List (Keep existing - generic enough)
    history: <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.41 1.41C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>, // Clock (Keep existing - generic)
    yourVideos: <path d="M8 5v14l11-7z"/>, // Simple Play Button
    watchLater: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.03 14.53l-4.78-3.03v-6h1.5v5.21l4.14 2.62-1.06 1.2z"/>, // Clock (Keep existing - generic)
    likedVideos: <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>, // Simple Heart
  };

  // Render a single sidebar navigation item
  const renderNavItem = (item) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
      onClick={isMobile ? closeSidebar : undefined} // Close sidebar on mobile click
      title={item.label} // Tooltip for collapsed state
    >
      <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
        {icons[item.icon]}
      </svg>
      <span className="sidebar-label">{item.label}</span>
    </NavLink>
  );

  // Conditional class for mobile overlay effect
  const sidebarClasses = `sidebar ${isOpen ? 'open' : 'collapsed'} ${isMobile ? 'mobile' : ''}`;

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && isOpen && <div className="sidebar-overlay" onClick={closeSidebar}></div>}
      
      <aside className={sidebarClasses}>
        <nav className="sidebar-nav">
          {/* Main Menu Section */}
          <div className="menu-section">
            {mainMenu.map(renderNavItem)}
          </div>

          {/* Divider */}
          <div className="menu-divider"></div>

          {/* Library Section */}
          <div className="menu-section">
            {/* Header only visible when expanded */}
            <div className="menu-header">Library</div>
            {libraryMenu.map(renderNavItem)}
          </div>

          {/* Divider */}
          <div className="menu-divider"></div>

          {/* TODO: Add Subscriptions Section */}
          {/* <div className="menu-section">
            <div className="menu-header">Subscriptions</div>
             Subscription items would go here
          </div> */}

        </nav>
        <style jsx>{`
          .sidebar {
            position: fixed;
            top: var(--header-height);
            left: 0;
            bottom: 0; /* Occupy full height */
            width: var(--sidebar-width);
            background-color: var(--white);
            overflow-y: auto;
            overflow-x: hidden;
            transition: width 0.2s ease-in-out, transform 0.2s ease-in-out;
            z-index: 900; /* Below header, above overlay */
            border-right: 1px solid var(--light-gray);
            padding-top: 12px; /* Add padding */
          }

          .sidebar.collapsed {
            width: var(--sidebar-collapsed-width);
          }

          /* Mobile specific styles */
          .sidebar.mobile {
            transform: translateX(-100%); /* Hidden by default */
            z-index: 1100; /* Above content when open */
            border-right: none; /* No border needed for overlay */
             box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2); /* Add shadow */
          }
          .sidebar.mobile.open {
            transform: translateX(0);
          }
          .sidebar-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1050; /* Below sidebar, above content */
            display: none; /* Hidden by default */
          }
          .sidebar.mobile.open + .sidebar-overlay {
            display: block; /* Show overlay when mobile sidebar is open */
          }


          /* Hide scrollbar visually but allow scrolling */
          .sidebar::-webkit-scrollbar {
            width: 8px;
          }
          .sidebar::-webkit-scrollbar-track {
            background: transparent;
          }
          .sidebar::-webkit-scrollbar-thumb {
            background-color: transparent; /* Hide thumb */
            border-radius: 20px;
          }
          .sidebar:hover::-webkit-scrollbar-thumb {
            background-color: var(--gray); /* Show thumb on hover */
          }


          .sidebar-nav {
            display: flex;
            flex-direction: column;
          }

          .menu-section {
            display: flex;
            flex-direction: column;
            margin-bottom: 8px; /* Space between sections */
          }

          .menu-divider {
            height: 1px;
            background-color: var(--light-gray);
            margin: 8px 12px;
          }

          .menu-header {
            padding: 8px 24px;
            font-size: 14px;
            font-weight: 500;
            color: var(--text-secondary);
            display: block; /* Visible by default */
          }

          .sidebar-item {
            display: flex;
            align-items: center;
            padding: 10px 24px; /* Adjusted padding */
            font-size: 14px;
            font-weight: 400; /* Normal weight */
            gap: 24px;
            cursor: pointer;
            color: var(--text);
            transition: background-color 0.2s;
            border-radius: 10px;
            margin: 0 12px; /* Horizontal margin */
            white-space: nowrap; /* Prevent label wrapping */
            overflow: hidden; /* Hide overflow */
          }

          .sidebar-item:hover {
            background-color: var(--light-gray);
          }
          .sidebar-item.active {
            background-color: #eee; /* Active state background */
            font-weight: 500; /* Bold active state */
          }
          .sidebar-item.active svg {
            /* Optional: Style active icon */
          }

          .sidebar-item svg {
            min-width: 24px; /* Ensure icon space */
            flex-shrink: 0; /* Prevent icon shrinking */
            fill: currentColor;
          }

          /* Styles for collapsed sidebar */
          .sidebar.collapsed .sidebar-label,
          .sidebar.collapsed .menu-header {
            display: none; /* Hide text */
          }
          .sidebar.collapsed .menu-divider {
            margin: 8px 4px; /* Reduce divider margin */
          }
          .sidebar.collapsed .sidebar-item {
            justify-content: center; /* Center icon */
            padding: 12px 8px; /* Adjust padding */
            margin: 0 4px; /* Adjust margin */
            gap: 0; /* No gap needed */
          }
          .sidebar.collapsed .menu-section {
            align-items: center; /* Center items */
          }

          /* Collapsed doesn't apply to mobile view */
          .sidebar.mobile .sidebar-label,
          .sidebar.mobile .menu-header {
              display: block !important; /* Always show text */
          }
          .sidebar.mobile .sidebar-item {
              justify-content: flex-start !important; /* Align left */
              padding: 10px 24px !important; /* Reset padding */
              margin: 0 12px !important; /* Reset margin */
              gap: 24px !important; /* Restore gap */
          }
        `}</style>
      </aside>
    </>
  );
};

export default Sidebar;
