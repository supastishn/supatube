import { Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './App.css';

// Importing components
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
// Importing pages (Make sure these files exist in src/pages/)
import Home from './pages/Home';
import VideoDetail from './pages/VideoDetail';
import Auth from './pages/Auth';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import Account from './pages/Account';
import NotFound from './pages/NotFound';
import SearchResults from './pages/SearchResults';
// Placeholder pages for routes mentioned in Sidebar
const Trending = () => <div>Trending Page</div>;
const Subscriptions = () => <div>Subscriptions Page</div>;
const History = () => <div>History Page</div>;
const YourVideos = () => <div>Your Videos Page</div>;
const WatchLater = () => <div>Watch Later Page</div>;
const LikedVideos = () => <div>Liked Videos Page</div>;


function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  // Sidebar state: true = open, false = closed
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const location = useLocation();

  // Handle responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Close sidebar on mobile resize, keep open on desktop resize
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial check
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on navigation change on mobile
  useEffect(() => {
      if (isMobile) {
          setSidebarOpen(false);
      }
  }, [location.pathname, isMobile]);


  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Check if the current route is an authentication page
  const isAuthPage = location.pathname.startsWith('/sign-in') || location.pathname.startsWith('/sign-up');

  // Determine main content class based on sidebar state and mobile status
  const getMainContentClass = () => {
    let className = 'main-content';
    if (isMobile) {
        // On mobile, the layout doesn't change if the overlay sidebar is open
        className += ' sidebar-open-mobile'; // Add this class for mobile specific padding if needed
    } else {
        // On desktop, adjust padding based on collapsed state
        if (!sidebarOpen) {
            className += ' sidebar-collapsed';
        }
    }
    return className;
  };


  return (
    <div className="app-container">
      {/* Render Header always */}
      <Header toggleSidebar={toggleSidebar} isMobile={isMobile} />

      <div className="content-container">
        {/* Conditionally render Sidebar based on auth page */}
        {!isAuthPage && (
          <Sidebar isOpen={sidebarOpen} isMobile={isMobile} closeSidebar={() => setSidebarOpen(false)} />
        )}

        {/* Main content area */}
        <main className={getMainContentClass()}>
          <Routes>
            {/* Authentication Routes */}
            <Route path="/sign-in" element={<Auth type="signin" />} />
            <Route path="/sign-up" element={<Auth type="signup" />} />

            {/* Core Content Routes */}
            <Route index element={<Home />} />
            <Route path="/videos/:id" element={<VideoDetail />} />
            {/* Add the new search route below */}
            <Route path="/search" element={<SearchResults />} />
            <Route path="/upload" element={
              <ProtectedRoute>
                <Upload />
              </ProtectedRoute>
            } />
            <Route path="/profile/:userId" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />

            {/* Add Account Page Route */}
            <Route path="/account" element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            } />

            {/* Additional Protected Routes from Sidebar */}
            <Route path="/trending" element={<Trending />} />
            <Route path="/subscriptions" element={
              <ProtectedRoute>
                <Subscriptions />
              </ProtectedRoute>
            } />
            <Route path="/history" element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            } />
            <Route path="/your-videos" element={
              <ProtectedRoute>
                <YourVideos />
              </ProtectedRoute>
            } />
            <Route path="/playlist" element={
              <ProtectedRoute>
                <WatchLater />
              </ProtectedRoute>
            } />
            <Route path="/liked-videos" element={
              <ProtectedRoute>
                <LikedVideos />
              </ProtectedRoute>
            } />

            {/* Catch All 404 Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
