import { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import GuessMap from '../components/Map/GuessMap';

const Play = () => {
  const [user] = useAuthState(auth);
  const [memories, setMemories] = useState([]);
  const [currentMemory, setCurrentMemory] = useState(null);
  const [gameState, setGameState] = useState('loading'); // loading, playing, result, finished
  const [score, setScore] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userGuess, setUserGuess] = useState(null);
  const [distance, setDistance] = useState(null);

  const loadMemories = useCallback(async () => {
    if (!user) return;

    try {
      console.log('Loading memories for user:', user.uid);
      setGameState('loading');

      const q = query(collection(db, 'memories'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const memoriesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('Found memories:', memoriesData.length);

      if (memoriesData.length === 0) {
        console.log('No memories found, setting no-memories state');
        setGameState('no-memories');
        return;
      }

      // Shuffle memories for random order
      const shuffled = memoriesData.sort(() => Math.random() - 0.5);
      setMemories(shuffled);
      setCurrentMemory(shuffled[0]);
      setGameState('playing');
      console.log('Game ready with', shuffled.length, 'memories');
    } catch (error) {
      console.error('Error loading memories:', error);
      setGameState('no-memories'); // Fallback to no-memories state on error
    }
  }, [user]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const calculateScore = (distance) => {
    // Maximum distance where you can still get points (2000km - more generous)
    const maxDistance = 2000;

    // If distance is beyond max, return 0 points
    if (distance >= maxDistance) return 0;

    // Perfect score for close guesses (< 1km - more generous)
    if (distance < 1) return 1000;

    // More generous scoring tiers
    if (distance < 5) return 900;
    if (distance < 25) return 800;
    if (distance < 100) return 650;
    if (distance < 250) return 500;
    if (distance < 500) return 350;
    if (distance < 1000) return 200;
    if (distance < 1500) return 100;

    // For distances between 1500-2000km, give minimal points
    return 50;
  };

  const handleMapGuess = (guessPosition) => {
    setUserGuess(guessPosition);
  };

  const submitGuess = () => {
    if (!userGuess) {
      alert('Please click on the map to make your guess');
      return;
    }

    const actualLat = currentMemory.location.lat;
    const actualLng = currentMemory.location.lng;

    const dist = calculateDistance(userGuess.lat, userGuess.lng, actualLat, actualLng);
    const points = calculateScore(dist);

    setDistance(dist);
    setScore(score + points);
    setGameState('result');
  };

  const nextMemory = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= memories.length) {
      setGameState('finished');
    } else {
      setCurrentIndex(nextIndex);
      setCurrentMemory(memories[nextIndex]);
      setUserGuess(null);
      setDistance(null);
      setGameState('playing');
    }
  };

  const restartGame = () => {
    setCurrentIndex(0);
    setScore(0);
    setUserGuess(null);
    setDistance(null);
    loadMemories();
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
            Hey there, you'll need to sign in first
          </h1>
          <p className="text-base" style={{ color: 'var(--warm-brown)' }}>
            I'd love to show you your memories, but I need to know who you are first
          </p>
        </div>
      </div>
    );
  }

  if (gameState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 flex items-center space-x-4">
          <div className="animate-spin w-8 h-8 border-3 border-t-transparent rounded-full" style={{ borderColor: 'var(--dusty-rose)' }}></div>
          <div className="text-xl font-journal" style={{ color: 'var(--deep-brown)' }}>
            Flipping through your pages...
          </div>
        </div>
      </div>
    );
  }

  // Debug: Show current state if something unexpected happens
  if (gameState !== 'no-memories' && gameState !== 'finished' && gameState !== 'playing' && gameState !== 'result') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
            Debug Info
          </h1>
          <p style={{ color: 'var(--warm-brown)' }}>
            Game State: {gameState}<br />
            User: {user ? 'Logged in' : 'Not logged in'}<br />
            Memories: {memories.length}<br />
            Current Memory: {currentMemory ? 'Set' : 'None'}
          </p>
          <button
            onClick={loadMemories}
            className="btn-warm px-6 py-2 rounded-full font-medium mt-4"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'no-memories') {
    return (
      <div className="side-by-side h-full">
        <div className="flex flex-col justify-center items-center p-6 md:p-12 relative overflow-hidden">
          <div className="text-center z-10">
            <h1 className="text-2xl md:text-3xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
              Your journal is empty
            </h1>
            <p className="text-lg mb-8" style={{ color: 'var(--warm-brown)' }}>
              Let's fill these pages with some memories first. Then we can play this little guessing game I made for you.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center p-6 md:p-12" style={{ background: 'linear-gradient(135deg, var(--soft-beige) 0%, var(--warm-cream) 100%)' }}>
          <a
            href="#journal"
            className="btn-warm px-8 py-4 rounded-full font-medium text-lg"
          >
            Start writing
          </a>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <div className="side-by-side h-full">
        <div className="flex flex-col justify-center items-center p-6 md:p-12 relative overflow-hidden">
          <div className="text-center z-10">
            <h1 className="text-3xl md:text-4xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
              Well done!
            </h1>
            <p className="text-lg mb-6" style={{ color: 'var(--warm-brown)' }}>
              You made it through all your memories. That was fun, wasn't it?
            </p>

            <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 mb-8">
              <div className="text-5xl md:text-6xl font-bold mb-4" style={{ color: 'var(--dusty-rose)' }}>{score}</div>
              <div className="text-xl mb-4" style={{ color: 'var(--warm-brown)' }}>points total</div>
              <div className="text-lg" style={{ color: 'var(--deep-brown)' }}>
                You went through {memories.length} memories and averaged about{' '}
                {Math.round(score / memories.length)} points each. Not bad at all.
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center p-6 md:p-12 pb-8 md:pb-16" style={{ background: 'linear-gradient(135deg, var(--soft-beige) 0%, var(--warm-cream) 100%)' }}>
          <div className="w-full max-w-sm space-y-4">
            <button
              onClick={restartGame}
              className="btn-sage w-full py-4 rounded-full font-medium text-lg"
            >
              Go again?
            </button>

            <button
              onClick={() => window.location.hash = 'journal'}
              className="btn-warm w-full py-4 rounded-full font-medium text-lg"
            >
              Back to your journal
            </button>

            <button
              onClick={() => window.location.hash = 'home'}
              className="w-full py-4 rounded-full font-medium text-lg transition-all duration-300"
              style={{
                background: 'var(--paper-white)',
                color: 'var(--warm-brown)',
                border: '2px solid var(--soft-beige)'
              }}
            >
              Close the journal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback if no current memory but we should be playing
  if (gameState === 'playing' && !currentMemory) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
            Hmm, something's not quite right
          </h1>
          <p className="text-base mb-4" style={{ color: 'var(--warm-brown)' }}>
            Let me try finding your memories again
          </p>
          <button
            onClick={loadMemories}
            className="btn-warm px-6 py-2 rounded-full font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="paper-texture border-b border-opacity-20 px-4 md:px-8 py-3 md:py-4 gap-3 flex justify-between items-center flex-shrink-0" style={{ borderColor: 'var(--warm-brown)' }}>
        <h1 className="text-lg sm:text-2xl font-journal font-semibold" style={{ color: 'var(--deep-brown)' }}>
          Let's play a little game
        </h1>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--warm-brown)' }}>
            {score} points • {currentIndex + 1} of {memories.length}
          </div>
        </div>
      </div>

      {currentMemory ? (
        <>
        <div className="side-by-side relative">
          {/* Left Side - Memory Display */}
          <div className="paper-texture p-4 md:p-6 border-r border-opacity-20 flex flex-col h-full" style={{ borderColor: 'var(--warm-brown)' }}>
            <div className="w-full md:w-4/5 mx-auto h-full flex flex-col">
              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto pb-4">
                <h2 className="text-xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
                  {currentMemory.title}
                </h2>

                {currentMemory.imageData && gameState === 'playing' && (
                  <div className="mb-4 flex-shrink-0">
                    <img
                      src={currentMemory.imageData}
                      alt={currentMemory.title}
                      className="w-full h-32 object-cover rounded-lg cozy-shadow"
                      style={{ filter: 'sepia(10%) saturate(90%)' }}
                    />
                  </div>
                )}

                <div className="paper-texture cozy-shadow rounded-lg p-4 mb-4">
                  <div className="story-scroll">
                    <p className="leading-relaxed text-sm" style={{ color: 'var(--ink-black)' }}>
                      {currentMemory.story}
                    </p>
                  </div>
                </div>

                {/* Show guess status when playing */}
                {gameState === 'playing' && userGuess && (
                  <div className="paper-texture cozy-shadow rounded-lg p-3 text-center mb-4">
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--deep-brown)' }}>
                      Got it, you picked a spot
                    </div>
                    <div className="text-xs" style={{ color: 'var(--warm-brown)' }}>
                      {userGuess.lat.toFixed(4)}, {userGuess.lng.toFixed(4)}
                    </div>
                  </div>
                )}

                {/* Results when finished guessing */}
                {gameState === 'result' && (
                  <div className="paper-texture cozy-shadow rounded-lg p-4 text-center mb-4">
                    <div className="text-2xl font-bold mb-1" style={{ color: 'var(--sage-green)' }}>
                      {calculateScore(distance)} points
                    </div>
                    <div className="text-sm mb-1" style={{ color: 'var(--warm-brown)' }}>
                      You were {distance.toFixed(1)} km away
                    </div>
                    <div className="text-xs" style={{ color: 'var(--deep-brown)' }}>
                      {currentMemory.location.name}
                    </div>
                  </div>
                )}

                {/* Instructions when no guess made */}
                {gameState === 'playing' && !userGuess && (
                  <div className="paper-texture cozy-shadow rounded-lg p-3 text-center">
                    <div className="text-sm" style={{ color: 'var(--warm-brown)' }}>
                      Where do you think this happened? Tap or click somewhere on the map
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Pure Map Interface */}
          <div className="flex flex-col" style={{ background: 'linear-gradient(135deg, var(--soft-beige) 0%, var(--warm-cream) 100%)' }}>
            {/* Minimal Header */}
            <div className="flex-shrink-0 p-3 border-b border-opacity-20 text-center" style={{ borderColor: 'var(--warm-brown)' }}>
              <h3 className="text-lg font-journal font-semibold" style={{ color: 'var(--deep-brown)' }}>
                Take your best guess
              </h3>
            </div>

            {/* Map Container - Fixed Height */}
            <div className="p-3 md:p-4">
              <div className="map-box">
                <GuessMap
                  onGuess={handleMapGuess}
                  guessPosition={userGuess}
                  actualPosition={gameState === 'result' ? currentMemory.location : null}
                  showResult={gameState === 'result'}
                  disabled={gameState === 'result'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action bar: always visible at the bottom, full width on every screen size */}
        {((gameState === 'playing' && userGuess) || gameState === 'result') && (
          <div className="game-action-bar paper-texture flex-shrink-0 px-4 pt-3">
            <div className="w-full max-w-sm mx-auto">
              {/* Submit button when playing */}
              {gameState === 'playing' && userGuess && (
                <button
                  onClick={submitGuess}
                  className="btn-sage w-full py-4 rounded-full font-medium text-lg"
                >
                  That's my guess
                </button>
              )}

              {/* Next Memory button when showing results */}
              {gameState === 'result' && (
                <button
                  onClick={nextMemory}
                  className="btn-warm w-full py-4 rounded-full font-medium text-lg"
                >
                  {currentIndex + 1 >= memories.length ? 'That was fun' : 'Next one'}
                </button>
              )}
            </div>
          </div>
        )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 text-center">
            <h2 className="text-xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
              Looking for your memory...
            </h2>
            <button
              onClick={loadMemories}
              className="btn-warm px-6 py-2 rounded-full font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Play;