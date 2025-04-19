import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p>Oops! The page you're looking for doesn't exist.</p>
      <p>It might have been moved or deleted.</p>
      <Link to="/" className="btn-primary">
        Go Back Home
      </Link>
      {/* Styles for this component are primarily in App.css */}
    </div>
  );
};

export default NotFound;
