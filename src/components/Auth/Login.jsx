import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '../../config/firebase';
import ExploreGlobe from '../ExploreGlobe';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setMessage('');
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      // Firebase automatically creates a new account the first time
      // someone signs in with a Google account that hasn't been used before.
      await signInWithPopup(auth, provider);
    } catch (error) {
      // Don't show an error if the user just closed the Google popup themselves
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        setError(error.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent! Check your inbox.');
      setShowForgotPassword(false);
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="cozy-container">
      <div className="side-by-side h-full">
        {/* Left Side - Explore: a dark globe of every memory saved, like phoneme.vercel.app/explore */}
        <div className="flex flex-col p-6 md:p-12 relative overflow-hidden h-full">
          <div className="flex-1 min-h-0 w-full">
            <ExploreGlobe />
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="flex flex-col justify-center items-center p-6 md:p-12" style={{ background: 'linear-gradient(135deg, var(--soft-beige) 0%, var(--warm-cream) 100%)' }}>
          <div className="w-full max-w-md">
            {/* Welcome block, moved here above the sign-in card */}
            <div className="text-center mb-6 md:mb-8">
              <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-3 md:mb-4 rounded-full bg-gradient-to-br from-yellow-200 to-orange-300 flex items-center justify-center text-2xl md:text-3xl">
                ✨
              </div>
              <h1 className="text-2xl md:text-3xl font-journal font-semibold mb-2" style={{ color: 'var(--deep-brown)' }}>
                Welcome to Mindstamps
              </h1>
              <p className="text-sm md:text-base leading-relaxed" style={{ color: 'var(--warm-brown)' }}>
                Your personal sanctuary for memories. A cozy space where every moment finds its home.
              </p>
            </div>

            <div className="paper-texture cozy-shadow rounded-2xl p-6 md:p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-journal font-semibold" style={{ color: 'var(--deep-brown)' }}>
                  {showForgotPassword ? 'Reset Password' : isSignUp ? 'Create Your Space' : 'Welcome Back'}
                </h2>
                <p className="text-sm mt-2" style={{ color: 'var(--warm-brown)' }}>
                  {showForgotPassword ? 'Enter your email to reset your password' : isSignUp ? 'Begin your memory journey' : 'Enter your cozy corner'}
                </p>
              </div>

            {showForgotPassword ? (
              <form className="space-y-6" onSubmit={handleForgotPassword}>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                    {message}
                  </div>
                )}

                <div>
                  <input
                    type="email"
                    required
                    className="vintage-input w-full"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-warm w-full py-3 rounded-full font-medium text-lg"
                >
                  Send Reset Email
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setError('');
                      setMessage('');
                    }}
                    className="text-sm transition-colors duration-300 hover:underline"
                    style={{ color: 'var(--warm-brown)' }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                    {message}
                  </div>
                )}

                <div>
                  <input
                    type="email"
                    required
                    className="vintage-input w-full"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <input
                    type="password"
                    required
                    className="vintage-input w-full"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-warm w-full py-3 rounded-full font-medium text-lg"
                >
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'var(--warm-brown)', opacity: 0.2 }} />
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--warm-brown)' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--warm-brown)', opacity: 0.2 }} />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full py-3 rounded-full font-medium text-base flex items-center justify-center gap-3 border transition-all duration-300 disabled:opacity-50"
                  style={{ borderColor: 'var(--soft-beige)', background: 'white', color: 'var(--deep-brown)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                  </svg>
                  {googleLoading ? 'Connecting...' : isSignUp ? 'Sign up with Google' : 'Continue with Google'}
                </button>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm transition-colors duration-300 hover:underline block w-full"
                    style={{ color: 'var(--warm-brown)' }}
                  >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                  </button>

                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError('');
                        setMessage('');
                      }}
                      className="text-sm transition-colors duration-300 hover:underline"
                      style={{ color: 'var(--warm-brown)' }}
                    >
                      Forgot your password?
                    </button>
                  )}
                </div>
              </form>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;