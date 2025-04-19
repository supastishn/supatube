import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

// Placeholder for authentication logic - replace with your actual context/API calls
const fakeAuth = {
  signin: async (email, password) => {
    console.log('Signing in with:', email, password);
    await new Promise(res => setTimeout(res, 500)); // Simulate API call
    // Simulate success/failure
    if (email === 'user@example.com' && password === 'password') {
      return { success: true, user: { id: '123', email } };
    } else {
      throw new Error('Invalid credentials');
    }
  },
  signup: async (email, password) => {
    console.log('Signing up with:', email, password);
    await new Promise(res => setTimeout(res, 500)); // Simulate API call
    // Simulate success/failure (e.g., email already exists)
    if (email === 'existing@example.com') {
       throw new Error('Email already in use');
    }
    return { success: true, user: { id: '456', email } };
  }
};


const Auth = ({ type }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignin = type === 'signin';

  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    setLoading(true);

    const { email, password, confirmPassword } = formData;

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
        await fakeAuth.signin(email, password);
        // TODO: Update global auth state (Context API, Redux, Zustand, etc.)
        console.log('Sign in successful!');
        // Redirect to previous page or home
        const from = location.state?.from?.pathname || "/";
        navigate(from, { replace: true });
      } else {
        await fakeAuth.signup(email, password);
        // TODO: Update global auth state
        console.log('Sign up successful!');
        // Redirect to home or profile setup page
        navigate('/');
      }
    } catch (err) {
      setError(err.message || `Failed to ${isSignin ? 'sign in' : 'sign up'}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h1 className="auth-title">{isSignin ? 'Sign In' : 'Create Account'}</h1>

      {error && <p className="auth-error">{error}</p>}

      <form className="auth-form" onSubmit={handleSubmit}>
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
      <style jsx>{`
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
      `}</style>
    </div>
  );
};

export default Auth;
