import { Routes, Route } from 'react-router-dom';
import './App.css';

// Placeholder Pages/Components (We'll create these properly later)
const Home = () => <div>Home Page - Video Feed</div>;
const VideoDetail = () => <div>Video Detail Page</div>;
const Auth = () => <div>Authentication Page (Login/Signup)</div>;
const Upload = () => <div>Upload Video Page</div>;
const Profile = () => <div>User Profile Page</div>;
const NotFound = () => <div>404 Not Found</div>;

function App() {
  // Basic layout idea - Header could go here outside Routes
  return (
    <main className="app-container">
      {/* <Header /> */} {/* Add Header component later */}
      <Routes>
        {/* Public Routes */}
        <Route path="/sign-in" element={<Auth />} />
        <Route path="/sign-up" element={<Auth />} /> {/* Often same component */}

        {/* Private/Protected Routes (Add auth logic later) */}
        <Route index element={<Home />} /> {/* Default route */}
        <Route path="/videos/:id" element={<VideoDetail />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/profile/:userId" element={<Profile />} />

        {/* Catch All */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* <Footer /> */} {/* Optional Footer */}
    </main>
  );
}

export default App;
