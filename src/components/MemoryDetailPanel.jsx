import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import MemoryLocationMap from './MemoryLocationMap';
import StreetView from './StreetView';

const formatDate = (timestamp) => {
  if (!timestamp) return 'A moment in time';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Right-side detail view opened from "Places everyone has saved".
// Shows the full memory (title, story, image, map) with an EDITING
// button pinned to the top of the panel.
const MemoryDetailPanel = ({ memory, currentUserId, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(memory.title || '');
  const [editStory, setEditStory] = useState(memory.story || '');
  const [editLocation, setEditLocation] = useState(memory.location || null);
  const [editImageryType, setEditImageryType] = useState(memory.imageType || 'photo');
  const [editImage, setEditImage] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(memory.imageData || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setEditTitle(memory.title || '');
    setEditStory(memory.story || '');
    setEditLocation(memory.location || null);
    setEditImageryType(memory.imageType || 'photo');
    setEditImage(null);
    setEditImagePreview(memory.imageData || null);
  }, [memory.id, memory.imageType, memory.imageData]);

  const handleEditImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEditImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setEditImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const isOwner = currentUserId && memory.userId && currentUserId === memory.userId;

  const handleSave = async () => {
    if (!editTitle.trim() || !editStory.trim()) {
      alert('Please fill in both the title and story');
      return;
    }
    setSaving(true);
    try {
      let imageData = memory.imageData || null;
      if (editImageryType === 'streetview') {
        imageData = null;
      } else if (editImage) {
        const reader = new FileReader();
        imageData = await new Promise((resolve) => {
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsDataURL(editImage);
        });
      }

      const memoryRef = doc(db, 'memories', memory.id);
      await updateDoc(memoryRef, {
        title: editTitle.trim(),
        story: editStory.trim(),
        location: editLocation,
        imageType: editImageryType,
        imageData,
      });
      memory.title = editTitle.trim();
      memory.story = editStory.trim();
      memory.location = editLocation;
      memory.imageType = editImageryType;
      memory.imageData = imageData;
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving memory:', error);
      if (error?.code === 'permission-denied') {
        alert('You can only edit memories you created.');
      } else {
        alert('Failed to save changes. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(memory.title || '');
    setEditStory(memory.story || '');
    setEditLocation(memory.location || null);
    setEditImageryType(memory.imageType || 'photo');
    setEditImage(null);
    setEditImagePreview(memory.imageData || null);
    setIsEditing(false);
  };

  return (
    <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 w-full max-w-lg text-left relative">
      {/* Top bar: back + EDITING button, always at the top of the right page */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium transition-opacity duration-200 hover:opacity-70"
          style={{ color: 'var(--warm-brown)' }}
        >
          ← Back
        </button>

        {!isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300"
            style={{ background: 'var(--dusty-rose)', color: 'white' }}
          >
            <span>✏️ EDIT</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium"
               style={{ background: 'var(--dusty-rose)', color: 'white' }}>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span>EDITING</span>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="text-2xl font-journal font-semibold leading-tight bg-transparent border-b outline-none w-full"
            style={{ color: 'var(--deep-brown)', borderColor: 'var(--soft-beige)' }}
            placeholder="Memory title..."
          />

          <div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setEditImageryType('photo')}
                className="rounded-lg py-2 text-center text-sm font-medium transition-all duration-300"
                style={{
                  border: `2px solid ${editImageryType === 'photo' ? 'var(--dusty-rose)' : 'var(--soft-beige)'}`,
                  background: editImageryType === 'photo' ? 'var(--warm-cream)' : 'transparent',
                  color: 'var(--deep-brown)',
                }}
              >
                📷 Photo
              </button>
              <button
                type="button"
                onClick={() => setEditImageryType('streetview')}
                className="rounded-lg py-2 text-center text-sm font-medium transition-all duration-300"
                style={{
                  border: `2px solid ${editImageryType === 'streetview' ? 'var(--dusty-rose)' : 'var(--soft-beige)'}`,
                  background: editImageryType === 'streetview' ? 'var(--warm-cream)' : 'transparent',
                  color: 'var(--deep-brown)',
                }}
              >
                🧭 Street View
              </button>
            </div>

            {editImageryType === 'photo' ? (
              <>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleEditImageChange}
                  className="vintage-input w-full text-sm"
                />
                {editImagePreview && (
                  <img
                    src={editImagePreview}
                    alt={editTitle}
                    className="w-full h-40 object-cover rounded-lg shadow-md mt-2"
                    style={{ filter: 'sepia(10%) saturate(90%)' }}
                  />
                )}
              </>
            ) : (
              <StreetView lat={editLocation?.lat} lng={editLocation?.lng} height="10rem" />
            )}
          </div>

          <textarea
            value={editStory}
            onChange={(e) => setEditStory(e.target.value)}
            className="w-full min-h-[8rem] font-journal leading-relaxed text-base bg-transparent border rounded-lg p-3 outline-none resize-none"
            style={{ color: 'var(--ink-black)', borderColor: 'var(--soft-beige)' }}
            placeholder="Tell your story..."
          />

          <MemoryLocationMap
            location={editLocation}
            editable
            onLocationChange={setEditLocation}
            height="11rem"
          />

          <div className="flex space-x-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-warm px-5 py-2 rounded-full font-medium text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-5 py-2 rounded-full font-medium text-sm transition-all duration-300"
              style={{ background: 'var(--paper-white)', color: 'var(--warm-brown)', border: '2px solid var(--soft-beige)' }}
            >
              Cancel
            </button>
          </div>

          {!isOwner && (
            <p className="text-xs italic" style={{ color: 'var(--warm-brown)' }}>
              This memory belongs to someone else — saving will only work if you have permission.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm font-journal italic" style={{ color: 'var(--warm-brown)' }}>
            {formatDate(memory.createdAt)}
          </div>

          <h2 className="text-2xl font-journal font-semibold" style={{ color: 'var(--deep-brown)' }}>
            {memory.title || 'Untitled memory'}
          </h2>

          {memory.imageType === 'streetview' ? (
            <StreetView lat={memory.location?.lat} lng={memory.location?.lng} height="10rem" />
          ) : memory.imageData && (
            <img
              src={memory.imageData}
              alt={memory.title}
              className="w-full h-40 object-cover rounded-lg shadow-md"
              style={{ filter: 'sepia(10%) saturate(90%)' }}
            />
          )}

          {memory.story && (
            <p className="font-journal leading-relaxed text-base whitespace-pre-wrap" style={{ color: 'var(--ink-black)' }}>
              {memory.story}
            </p>
          )}

          <MemoryLocationMap location={memory.location} height="11rem" />
        </div>
      )}
    </div>
  );
};

export default MemoryDetailPanel;
