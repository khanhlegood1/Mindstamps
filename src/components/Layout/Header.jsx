import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../config/firebase';
import { signOut } from 'firebase/auth';

const Header = () => {
  const [user] = useAuthState(auth);
  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash.slice(1);
    return hash || 'home';
  });

  // Keep the active tab in sync with the URL (back/forward buttons, in-page links)
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(window.location.hash.slice(1) || 'home');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } finally {
      // Always land back on the root/home view, even if the user was
      // deep in #play or #journal when they hit "Sign Out".
      if (window.location.hash) {
        window.location.hash = '';
      } else {
        setCurrentPage('home');
      }
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'journal', label: 'Journal', icon: '📖' },
    { id: 'play', label: 'Play', icon: '🎮' }
  ];

  return (
    <header className="app-header paper-texture border-b-2 border-opacity-20" style={{ borderColor: 'var(--warm-brown)' }}>
      {/*
        Phone:  row 1 = logo + user, row 2 = full-width tabs
        iPad / laptop: everything on one row
      */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-yellow-200 to-orange-300 flex items-center justify-center text-lg md:text-xl">
            ✨
          </div>
          <h1 className="text-xl md:text-2xl font-journal font-semibold truncate" style={{ color: 'var(--deep-brown)' }}>
            Mindstamps
          </h1>
        </div>

        {user && (
          <div
            className="order-2 md:order-3 ml-auto md:ml-0 flex items-center space-x-2 md:space-x-4 md:pl-6 md:border-l border-opacity-30"
            style={{ borderColor: 'var(--warm-brown)' }}
          >
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-200 to-blue-200 flex items-center justify-center text-sm flex-shrink-0">
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              {/* Name only where there is room (laptop / large iPad) */}
              <span className="hidden lg:inline text-sm font-medium" style={{ color: 'var(--deep-brown)' }}>
                {user.displayName || user.email?.split('@')[0] || 'User'}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="px-3 py-2 md:py-1 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 hover:shadow-md"
              style={{
                background: 'linear-gradient(135deg, var(--dusty-rose) 0%, var(--warm-brown) 100%)',
                color: 'white'
              }}
            >
              Sign Out
            </button>
          </div>
        )}

        <nav className="order-3 md:order-2 md:ml-auto w-full md:w-auto flex items-center space-x-1">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`flex flex-1 md:flex-none items-center justify-center space-x-2 px-3 md:px-4 py-2 rounded-full transition-all duration-300 ${
                currentPage === item.id
                  ? 'bg-gradient-to-r from-orange-200 to-yellow-200 shadow-md'
                  : 'hover:bg-gradient-to-r hover:from-orange-100 hover:to-yellow-100'
              }`}
              style={{ color: 'var(--deep-brown)' }}
              onClick={() => setCurrentPage(item.id)}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
