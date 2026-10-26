import { useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import LocationPicker from '../components/Map/LocationPicker';
import VoiceRecorder from '../components/VoiceRecorder';
import StreetView from '../components/StreetView';
import { classifyVideoUrl } from '../lib/videoLink';
import { generateLearningPageSpec } from '../lib/videoLearning';
import { fileToStoredImageDataUrl } from '../utils/imageStorage';
import LearningGamePanel from '../components/LearningGamePanel';

const CreateMemory = ({ onBack = null, onSuccess = null }) => {
  const [user] = useAuthState(auth);
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [location, setLocation] = useState({ lat: '', lng: '', name: '' });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageryType, setImageryType] = useState('photo'); // 'photo' | 'streetview'
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdMemoryTitle, setCreatedMemoryTitle] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [currentVoiceField, setCurrentVoiceField] = useState('title');
  const [isTogglingVoice, setIsTogglingVoice] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [learningSpec, setLearningSpec] = useState(null);
  const [learningSpecLoading, setLearningSpecLoading] = useState(false);
  const [learningSpecError, setLearningSpecError] = useState('');
  // "Tạo game giáo dục": JSON spec do AI sinh (lưu kèm memory ở field
  // `learningGame`) + nguồn model đã dùng; HTML game được render client-side
  // từ spec mỗi khi chơi (xem src/lib/learningGame.js).
  const [gameSpec, setGameSpec] = useState(null);
  const [gameSource, setGameSource] = useState('');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleLocationSelect = (selectedLocation) => {
    setLocation(selectedLocation);
  };

  const handleVoiceTranscription = (transcript, isFinal, field) => {
    console.log('Voice transcription:', { transcript, isFinal, field, currentVoiceField });
    setVoiceTranscript(transcript);
    
    if (isFinal && transcript.trim()) {
      // Clean transcript (remove navigation and command words)
      const cleanTranscript = transcript
        .replace(/\b(next field|next|move on|submit|save memory|create memory|address is|location is|at)\b/gi, '')
        .trim();
      
      console.log('Clean transcript:', cleanTranscript, 'for field:', field);
      
      if (cleanTranscript) {
        // Auto-populate the appropriate field
        if (field === 'title') {
          console.log('Adding to title:', cleanTranscript);
          setTitle(prev => prev + (prev ? ' ' : '') + cleanTranscript);
        } else if (field === 'story') {
          console.log('Adding to story:', cleanTranscript);
          setStory(prev => prev + (prev ? ' ' : '') + cleanTranscript);
        } else if (field === 'location') {
          console.log('Adding to location:', cleanTranscript);
          // For location, we'll use it to search/set the location
          handleVoiceLocation(cleanTranscript);
        }
      }
      setVoiceTranscript('');
    }
  };

  const handleVoiceLocation = async (locationText) => {
    // Set location name and try to geocode it
    setLocation(prev => ({
      ...prev,
      name: locationText
    }));
    
    // Try to geocode the location (basic implementation)
    try {
      // This is a simple approach - in production you'd use a proper geocoding service
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationText)}`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        setLocation({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          name: locationText
        });
      }
    } catch (error) {
      console.log('Geocoding failed, using text only:', error);
      // Keep the text-only location if geocoding fails
    }
  };

  const handleVoiceFieldChange = (newField) => {
    console.log('Voice field changing from', currentVoiceField, 'to', newField);
    setCurrentVoiceField(newField);
    
    // Provide audio feedback
    if ('speechSynthesis' in window) {
      const fieldNames = {
        title: 'memory title',
        story: 'story',
        location: 'location'
      };
      const utterance = new SpeechSynthesisUtterance(`Now recording ${fieldNames[newField] || newField}`);
      utterance.volume = 0.5;
      utterance.rate = 1.2;
      speechSynthesis.speak(utterance);
    }
  };

  const handleVoiceSubmit = () => {
    // Trigger form submission via voice
    if (title.trim() && story.trim()) {
      const form = document.querySelector('form');
      if (form) {
        form.requestSubmit();
      }
    } else {
      // Provide audio feedback about missing fields
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance('Please provide both a title and story before submitting');
        utterance.volume = 0.7;
        speechSynthesis.speak(utterance);
      }
    }
  };

  const handleVoiceError = (error) => {
    alert(`Voice recording error: ${error}`);
  };

  const toggleVoiceMode = () => {
    // Prevent rapid toggling
    if (isTogglingVoice) {
      console.log('Voice toggle already in progress, ignoring');
      return;
    }
    
    setIsTogglingVoice(true);
    const newVoiceMode = !isVoiceMode;
    
    console.log('Toggling voice mode from', isVoiceMode, 'to', newVoiceMode);
    setIsVoiceMode(newVoiceMode);
    
    if (newVoiceMode) {
      // Reset to first field when enabling voice mode
      setCurrentVoiceField('title');
      console.log('Voice mode enabled, starting with title field');
      
      // Provide audio instructions
      if ('speechSynthesis' in window) {
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance('Voice mode activated. Start with your memory title, then say next to move between fields, or submit to save your memory.');
          utterance.volume = 0.6;
          utterance.rate = 1.1;
          speechSynthesis.speak(utterance);
        }, 1000);
      }
    } else {
      console.log('Voice mode disabled');
    }
    
    // Reset toggle lock after a delay
    setTimeout(() => {
      setIsTogglingVoice(false);
    }, 1000);
  };

  // Nút "Tạo trang học tập từ video": nhận link YouTube, lấy transcript +
  // Groq sinh JSON spec cho một trang học tập tương tác dựa trên nội dung
  // video (xem src/lib/videoLearning.js + api/video-to-learning.js). Kết quả
  // được lưu kèm memory (field videoLearningSpec) khi submit.
  const handleGenerateLearningPage = async () => {
    const classified = classifyVideoUrl(videoUrl);
    if (!classified) {
      setLearningSpecError('Vui lòng dán một link video YouTube hợp lệ (video/short có phụ đề).');
      return;
    }

    setLearningSpecLoading(true);
    setLearningSpecError('');
    setLearningSpec(null);
    try {
      const result = await generateLearningPageSpec(classified.url);
      setLearningSpec(result.spec);
    } catch (err) {
      setLearningSpecError(err.message || 'Không tạo được trang học tập từ video này.');
    }
    setLearningSpecLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Debug logging
    console.log('Form submission attempt:', {
      user: !!user,
      title: title,
      story: story,
      location: location,
      image: !!image
    });

    if (!user) {
      alert('You must be signed in to create memories');
      return;
    }
    
    if (!title.trim()) {
      alert('Please enter a memory title');
      return;
    }
    
    if (!story.trim()) {
      alert('Please enter your story');
      return;
    }
    
    if (!location.lat || !location.lng) {
      alert('Please select a location on the map or search for an address');
      return;
    }
    
    setLoading(true);
    try {
      console.log('Starting Firebase operations...');
      
      // Convert image to base64 for storage in Firestore (temporary solution).
      // When the "Street View" imagery option is chosen, we don't store a
      // photo at all — the memory's own location is enough to render the
      // Street View panorama later.
      let imageData = null;
      if (imageryType === 'photo' && image) {
        // Resize/re-compress only as much as needed to fit Firestore's
        // per-field size limit, keeping the best quality that still fits.
        imageData = await fileToStoredImageDataUrl(image);
      }

      // Save memory to Firestore
      console.log('Saving to Firestore...');
      const docRef = await addDoc(collection(db, 'memories'), {
        title: title.trim(),
        story: story.trim(),
        location,
        imageData, // Store base64 image data directly (not recommended for production)
        imageType: imageryType, // 'photo' | 'streetview'
        videoUrl: videoUrl.trim() || null,
        videoLearningSpec: learningSpec || null,
        learningGame: gameSpec || null,
        learningGameSource: gameSource || null,
        userId: user.uid,
        createdAt: new Date(),
      });
      console.log('Memory saved successfully:', docRef.id);

      setCreatedMemoryTitle(title.trim());
      setSuccess(true);
    } catch (error) {
      console.error('Detailed error creating memory:', error);
      alert(`Error creating memory: ${error.message}`);
    }
    setLoading(false);
  };

  const createAnotherMemory = () => {
    setSuccess(false);
    setCreatedMemoryTitle('');
    setTitle('');
    setStory('');
    setLocation({ lat: '', lng: '', name: '' });
    setImage(null);
    setImagePreview(null);
    setImageryType('photo');
    setVideoUrl('');
    setLearningSpec(null);
    setLearningSpecError('');
    setGameSpec(null);
    setGameSource('');
  };

  const goToPlay = () => {
    window.location.hash = 'play';
  };

  const handleBackToJournal = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.hash = 'journal';
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">You'll need to sign in first</h1>
        <p className="text-base" style={{ color: 'var(--warm-brown)' }}>
          This is your personal space for memories
        </p>
      </div>
    );
  }

  // Show success screen
  if (success) {
    return (
      <div className="side-by-side h-full">
          {/* Left Side - Success Message */}
          <div className="flex flex-col justify-center items-center p-6 md:p-12 relative overflow-hidden">
            <div className="text-center z-10">
              <h1 className="text-3xl md:text-4xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
                Nice work
              </h1>
              <p className="text-lg mb-8" style={{ color: 'var(--warm-brown)' }}>
                Your memory is now part of your collection
              </p>
              
              <div className="paper-texture cozy-shadow rounded-2xl p-6 mb-8">
                <h2 className="text-2xl font-journal font-semibold mb-2" style={{ color: 'var(--deep-brown)' }}>
                  "{createdMemoryTitle}"
                </h2>
                <p className="text-sm" style={{ color: 'var(--warm-brown)' }}>
                  Saved to your journal
                </p>
              </div>
            </div>
          </div>

          {/* Right Side - Action Buttons */}
          <div className="flex flex-col justify-center items-center p-6 md:p-12" style={{ background: 'linear-gradient(135deg, var(--soft-beige) 0%, var(--warm-cream) 100%)' }}>
            <div className="w-full max-w-sm space-y-4">
              <button
                onClick={createAnotherMemory}
                className="btn-warm w-full py-4 rounded-full font-medium text-lg"
              >
                Write another one
              </button>
              
              <button
                onClick={goToPlay}
                className="btn-sage w-full py-4 rounded-full font-medium text-lg"
              >
                Try the guessing game
              </button>
              
              <button
                onClick={handleBackToJournal}
                className="w-full py-4 rounded-full font-medium text-lg transition-all duration-300"
                style={{ 
                  background: 'var(--paper-white)',
                  color: 'var(--warm-brown)',
                  border: '2px solid var(--soft-beige)'
                }}
              >
                Back to your journal
              </button>
            </div>
          </div>
        </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="paper-texture border-b border-opacity-20 px-4 sm:px-8 py-3 sm:py-4 gap-2 flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--warm-brown)' }}>
        <div className="flex items-center flex-1 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="mr-2 sm:mr-4 flex-shrink-0 flex items-center space-x-2 px-3 py-2 rounded-full transition-all duration-300 hover:bg-gradient-to-r hover:from-orange-100 hover:to-yellow-100"
              style={{ color: 'var(--warm-brown)' }}
            >
              <span>←</span>
              <span className="hidden sm:inline">Back to your journal</span>
              <span className="sm:hidden">Back</span>
            </button>
          )}
          <h1 className="text-lg sm:text-2xl font-journal font-semibold truncate" style={{ color: 'var(--deep-brown)' }}>
            Write a new memory
          </h1>
        </div>
        
        {/* Voice Mode Toggle */}
        <button
          onClick={toggleVoiceMode}
          className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center flex-shrink-0 space-x-2 whitespace-nowrap ${
            isVoiceMode 
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg' 
              : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-gray-200 hover:to-gray-300'
          }`}
        >
          <span>🎤</span>
          <span>{isVoiceMode ? 'Voice On' : 'Voice Off'}</span>
        </button>
      </div>

      <div className="side-by-side">
        {/* Left Side - Form */}
        <div className="paper-texture p-5 md:p-8 overflow-y-auto border-r border-opacity-20" style={{ borderColor: 'var(--warm-brown)' }}>
          <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
            {/* Title */}
            <div className={`${isVoiceMode && currentVoiceField === 'title' ? 'ring-2 ring-purple-300 rounded-lg p-2' : ''}`}>
              <label className="block text-sm font-medium mb-2 flex items-center" style={{ color: 'var(--deep-brown)' }}>
                What should we call this memory?
                {isVoiceMode && currentVoiceField === 'title' && (
                  <span className="ml-2 px-2 py-1 bg-purple-500 text-white text-xs rounded-full animate-pulse">
                    🎤 Active
                  </span>
                )}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="vintage-input w-full"
                placeholder={isVoiceMode ? "Speak your memory title or type here..." : "Something like 'That amazing sunset in Paris'"}
                required
              />
            </div>

            {/* Story */}
            <div className={`${isVoiceMode && currentVoiceField === 'story' ? 'ring-2 ring-purple-300 rounded-lg p-2' : ''}`}>
              <label className="block text-sm font-medium mb-2 flex items-center" style={{ color: 'var(--deep-brown)' }}>
                Tell me what happened
                {isVoiceMode && currentVoiceField === 'story' && (
                  <span className="ml-2 px-2 py-1 bg-purple-500 text-white text-xs rounded-full animate-pulse">
                    🎤 Active
                  </span>
                )}
              </label>
              
              {/* Voice Recorder */}
              {isVoiceMode && (
                <div className="mb-4 p-4 rounded-lg border-2 border-dashed" style={{ 
                  background: 'var(--soft-beige)',
                  borderColor: currentVoiceField === 'story' ? 'var(--dusty-rose)' : 'var(--warm-brown)'
                }}>
                  <VoiceRecorder 
                    onTranscription={handleVoiceTranscription}
                    onError={handleVoiceError}
                    onFieldChange={handleVoiceFieldChange}
                    onSubmit={handleVoiceSubmit}
                    currentField={currentVoiceField}
                    autoStart={true}
                  />
                </div>
              )}
              
              <textarea
                value={story}
                onChange={(e) => setStory(e.target.value)}
                rows={isVoiceMode ? 6 : 4}
                className="vintage-input w-full resize-none"
                placeholder={isVoiceMode ? "Your voice recording will appear here, or type manually..." : "Write about what made this moment special..."}
                required
              />
              
              {voiceTranscript && (
                <div className="mt-2 p-2 rounded text-sm italic" style={{ background: 'var(--warm-cream)', color: 'var(--warm-brown)' }}>
                  Currently speaking: "{voiceTranscript}"
                </div>
              )}
            </div>

            {/* Video link -> AI-generated learning page spec (JSON) */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--deep-brown)' }}>
                Link video (tuỳ chọn)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => { setVideoUrl(e.target.value); setLearningSpecError(''); }}
                  className="vintage-input w-full"
                  placeholder="Dán link video YouTube liên quan đến kỷ niệm này..."
                />
                <button
                  type="button"
                  onClick={handleGenerateLearningPage}
                  disabled={!videoUrl.trim() || learningSpecLoading}
                  className="btn-sage whitespace-nowrap px-4 rounded-full font-medium disabled:opacity-50"
                >
                  {learningSpecLoading ? 'Đang tạo...' : 'Tạo trang học tập từ video'}
                </button>
              </div>

              {learningSpecError && (
                <div className="mt-2 p-2.5 rounded text-sm" style={{ background: '#fdeaea', color: '#a33' }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <span className="leading-relaxed">{learningSpecError}</span>
                    <button
                      type="button"
                      onClick={handleGenerateLearningPage}
                      disabled={!videoUrl.trim() || learningSpecLoading}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-all duration-200 hover:shadow-md disabled:opacity-50"
                      style={{ background: 'var(--warm-brown)' }}
                    >
                      🔁 Thử lại
                    </button>
                  </div>
                </div>
              )}

              {learningSpec && (
                <div className="mt-2 p-3 rounded text-sm" style={{ background: 'var(--warm-cream)', color: 'var(--deep-brown)' }}>
                  <div className="font-medium mb-1">Đã tạo spec trang học tập (sẽ lưu kèm kỷ niệm):</div>
                  <div className="whitespace-pre-wrap" style={{ maxHeight: '10rem', overflowY: 'auto' }}>{learningSpec}</div>
                </div>
              )}

              {/* Nút "Tạo game giáo dục": AI đọc video + tiêu đề + câu chuyện
                  + ảnh, sinh JSON game spec rồi render HTML chơi được ngay. */}
              <div className="mt-3">
                <LearningGamePanel
                  videoUrl={videoUrl}
                  title={title}
                  story={story}
                  imageData={imagePreview}
                  memoryTitle={title}
                  spec={gameSpec}
                  onSpecChange={setGameSpec}
                  source={gameSource}
                  onSourceChange={setGameSource}
                />
              </div>
            </div>

            {/* Location Display */}
            {isVoiceMode && (
              <div className={`${currentVoiceField === 'location' ? 'ring-2 ring-purple-300 rounded-lg p-2' : ''}`}>
                <label className="block text-sm font-medium mb-2 flex items-center" style={{ color: 'var(--deep-brown)' }}>
                  Location
                  {currentVoiceField === 'location' && (
                    <span className="ml-2 px-2 py-1 bg-purple-500 text-white text-xs rounded-full animate-pulse">
                      🎤 Active
                    </span>
                  )}
                </label>
                <div className="vintage-input w-full bg-gray-50" style={{ minHeight: '40px', display: 'flex', alignItems: 'center' }}>
                  {location.name ? (
                    <span style={{ color: 'var(--deep-brown)' }}>{location.name}</span>
                  ) : (
                    <span style={{ color: 'var(--warm-brown)' }}>Say "address is [your location]" to set location</span>
                  )}
                </div>
              </div>
            )}

            {/* Imagery: a photo you took, or a live Street View of the location */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--deep-brown)' }}>
                Imagery (totally optional)
              </label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setImageryType('photo')}
                  className="rounded-xl p-3 text-center transition-all duration-300"
                  style={{
                    border: `2px solid ${imageryType === 'photo' ? 'var(--dusty-rose)' : 'var(--soft-beige)'}`,
                    background: imageryType === 'photo' ? 'var(--warm-cream)' : 'transparent',
                    color: 'var(--deep-brown)',
                  }}
                >
                  <div className="text-xl mb-1">📷</div>
                  <div className="text-sm font-medium">Photo</div>
                </button>
                <button
                  type="button"
                  onClick={() => setImageryType('streetview')}
                  className="rounded-xl p-3 text-center transition-all duration-300"
                  style={{
                    border: `2px solid ${imageryType === 'streetview' ? 'var(--dusty-rose)' : 'var(--soft-beige)'}`,
                    background: imageryType === 'streetview' ? 'var(--warm-cream)' : 'transparent',
                    color: 'var(--deep-brown)',
                  }}
                >
                  <div className="text-xl mb-1">🧭</div>
                  <div className="text-sm font-medium">Street View</div>
                </button>
              </div>

              {imageryType === 'photo' ? (
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="vintage-input w-full"
                />
              ) : (
                <p className="text-sm" style={{ color: 'var(--warm-brown)' }}>
                  We'll show a live Street View of wherever you pin on the map.
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-warm w-full py-3 rounded-full font-medium text-lg disabled:opacity-50"
            >
              {loading ? 'Saving this memory...' : 'Save this memory'}
            </button>
          </form>
        </div>

        {/* Right Side - Map and Preview */}
        <div className="flex flex-col pb-8" style={{ background: 'linear-gradient(135deg, var(--soft-beige) 0%, var(--warm-cream) 100%)' }}>
          {/* Imagery Preview */}
          {imageryType === 'photo' && imagePreview && (
            <div className="p-4 md:p-6 border-b border-opacity-20" style={{ borderColor: 'var(--warm-brown)' }}>
              <h3 className="text-lg font-journal font-semibold mb-3" style={{ color: 'var(--deep-brown)' }}>
                Your photo
              </h3>
              <div className="paper-texture cozy-shadow rounded-lg overflow-hidden">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-32 object-cover"
                  style={{ filter: 'sepia(10%) saturate(90%)' }}
                />
              </div>
            </div>
          )}

          {imageryType === 'streetview' && (
            <div className="p-4 md:p-6 border-b border-opacity-20" style={{ borderColor: 'var(--warm-brown)' }}>
              <h3 className="text-lg font-journal font-semibold mb-3" style={{ color: 'var(--deep-brown)' }}>
                Street View preview
              </h3>
              <div className="paper-texture cozy-shadow rounded-lg overflow-hidden">
                <StreetView lat={location.lat || null} lng={location.lng || null} height="8rem" />
              </div>
            </div>
          )}

          {/* Location Picker */}
          <div className="flex-1 p-4 md:p-6">
            <h3 className="text-lg font-journal font-semibold mb-3" style={{ color: 'var(--deep-brown)' }}>
              Where did this happen?
            </h3>
            <div>
              <LocationPicker 
                onLocationSelect={handleLocationSelect}
                initialLocation={location.lat ? location : null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateMemory;