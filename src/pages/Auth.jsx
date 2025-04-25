import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Auth = ({ type }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignin = type === 'signin';
  const { login, register } = useAuth();

  const [formData, setFormData] = useState({ 
    email: '', 
    password: '', 
    confirmPassword: '',
    name: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    setLoading(true);

    const { email, password, confirmPassword, name } = formData;

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password.');
      setLoading(false);
      return;
    }
    
    if (!isSignin && password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      if (isSignin) {
        await login(email, password);

        // Add a 3-second delay then reload
        setTimeout(() => {
          console.log('Reloading page after 3 seconds...');
          window.location.reload();
        }, 3000); // 3000 milliseconds = 3 seconds

        // Redirect to previous page or home (this will happen before the reload)
        const from = location.state?.from?.pathname || "/";
        navigate(from, { replace: true });
      } else {
        await register(email, password, name);
        // Redirect to home after successful registration and auto-login
        navigate('/');
      }
    } catch (err) {
      // Handle specific Appwrite errors with more user-friendly messages
      if (err.code === 400) {
        setError('Invalid email or password');
      } else if (err.code === 409) {
        setError('An account with this email already exists');
      } else {
        setError(err.message || `Failed to ${isSignin ? 'sign in' : 'sign up'}. Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h1 className="auth-title">{isSignin ? 'Sign In' : 'Create Account'}</h1>

      {error && <p className="auth-error">{error}</p>}

      <form className="auth-form" onSubmit={handleSubmit}>
        {!isSignin && (
          <div className="form-group">
            <label className="form-label" htmlFor="name">Name</label>
            <input
              className="form-input"
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              aria-label="Name"
              placeholder="Your display name"
            />
          </div>
          )}
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input
            className="form-input"
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            aria-label="Email Address"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input
            className="form-input"
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            aria-label="Password"
          />
        </div>
        {!isSignin && (
          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
            <input
              className="form-input"
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              aria-label="Confirm Password"
            />
          </div>
        )}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Processing...' : (isSignin ? 'Sign In' : 'Sign Up')}
        </button>
      </form>

      <div className="auth-switch">
        {isSignin ? (
          <>
            Don't have an account? <Link to="/sign-up">Sign up</Link>
          </>
        ) : (
          <>
            Already have an account? <Link to="/sign-in">Sign in</Link>
          </>
        )}
      </div>
      {/* Inline styles specific to Auth page */}
      <style>{`
        .auth-container {
          max-width: 480px;
          margin: 100px auto;
          padding: 32px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          background-color: #fff;
        }
        .auth-title {
          margin-bottom: 24px;
          text-align: center;
          color: #202020;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-label {
          font-weight: 500;
          font-size: 14px;
        }
        .form-input {
          padding: 12px;
          border-radius: 4px;
          border: 1px solid #ddd;
          font-size: 16px;
        }
        .form-input:focus {
          border-color: #1a73e8;
          outline: none;
        }
        .btn-primary {
          padding: 12px;
          background-color: #1a73e8;
          color: white;
          font-weight: 500;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 8px;
        }
        .btn-primary:hover {
          background-color: #1565C0;
        }
        .auth-error {
            background-color: #ffebee; /* Light red background */
            color: #c62828; /* Darker red text */
            padding: 10px 15px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 14px;
            border: 1px solid #ef9a9a; /* Light red border */
            text-align: center;
        }
        .btn-primary[disabled] {
            background-color: var(--gray);
            cursor: not-allowed;
        }
        .auth-switch {
          margin-top: 24px;
          text-align: center;
          font-size: 14px;
        }
        .auth-switch a {
          color: #1a73e8;
          text-decoration: none;
          font-weight: 500;
        }
        .auth-switch a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default Auth;
