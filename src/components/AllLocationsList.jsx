import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Shows every saved location across all users (not just the current one).
// Requires Firestore security rules to allow reading the `memories`
// collection beyond the owner-only default — see README / setup notes.
//
// onSelect(memory) is called with the full memory record when a row is
// clicked, so the caller (Home page) can open a detail view for it.
const AllLocationsList = ({ onSelect, selectedId }) => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadLocations = async () => {
      try {
        const q = query(
          collection(db, 'memories'),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        const snapshot = await getDocs(q);
        const items = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data.location?.name || null,
              lat: data.location?.lat,
              lng: data.location?.lng,
              location: data.location || null,
              title: data.title || null,
              story: data.story || '',
              imageData: data.imageData || null,
              imageType: data.imageType || null,
              createdAt: data.createdAt || null,
              userId: data.userId || null,
            };
          })
          .filter((item) => typeof item.lat === 'number' && typeof item.lng === 'number');

        if (isMounted) setLocations(items);
      } catch (err) {
        console.error('Error loading all locations:', err);
        if (isMounted) {
          setError(
            err?.code === 'permission-denied'
              ? 'Firestore rules currently block reading other users\u2019 memories.'
              : 'Could not load places right now.'
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadLocations();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8">
      <h2 className="text-2xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
        Places everyone has saved
      </h2>

      {loading && (
        <p className="text-base" style={{ color: 'var(--warm-brown)' }}>Loading places...</p>
      )}

      {!loading && error && (
        <p className="text-base" style={{ color: 'var(--warm-brown)' }}>{error}</p>
      )}

      {!loading && !error && locations.length === 0 && (
        <p className="text-base" style={{ color: 'var(--warm-brown)' }}>
          No memories with a location yet.
        </p>
      )}

      {!loading && !error && locations.length > 0 && (
        <>
          <p className="text-sm mb-3" style={{ color: 'var(--warm-brown)' }}>
            {locations.length} {locations.length === 1 ? 'place' : 'places'} saved across all users
          </p>
          <ul className="space-y-3 max-h-72 md:max-h-96 overflow-y-auto pr-1">
            {locations.map((loc) => {
              const isSelected = selectedId === loc.id;
              return (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => onSelect && onSelect(loc)}
                    className="w-full flex items-start justify-between gap-3 pb-3 pt-1 px-2 -mx-2 border-b border-opacity-20 text-left rounded-lg transition-colors duration-200"
                    style={{
                      borderColor: 'var(--warm-brown)',
                      background: isSelected ? 'rgba(180, 83, 9, 0.08)' : 'transparent',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate" style={{ color: 'var(--deep-brown)' }}>
                        {loc.name || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
                      </div>
                      {loc.title && (
                        <div className="text-sm truncate" style={{ color: 'var(--warm-brown)' }}>
                          {loc.title}
                        </div>
                      )}
                    </div>
                    <div className="text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'var(--warm-brown)' }}>
                      {formatDate(loc.createdAt)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default AllLocationsList;
