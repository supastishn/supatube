import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, storage } from '../lib/appwriteConfig'; // Import Appwrite services
import { ID } from 'appwrite';                             // Import ID directly from 'appwrite'
import { appwriteConfig } from '../lib/appwriteConfig'; // Import config for IDs

const Upload = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [duration, setDuration] = useState(null); // State to store video duration in seconds
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Function to get video duration
  const getVideoDuration = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const media = new Audio(reader.result);
        media.onloadedmetadata = () => resolve(Math.round(media.duration)); // Resolve with rounded duration in seconds
        media.onerror = (e) => reject(`Error getting video duration: ${e.message || 'Unknown error'}`);
      };
      reader.onerror = (e) => reject(`Error reading file: ${e.message || 'Unknown error'}`);
      reader.readAsDataURL(file);
    });
  };

  const handleVideoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setVideoFile(null);
      setDuration(null);
      return;
    }

    setVideoFile(file);
    setError(''); // Clear previous errors
    setDuration(null); // Reset duration while calculating
    setIsLoading(true); // Show loading indicator during duration calculation

    try {
      const videoDuration = await getVideoDuration(file);
      if (isNaN(videoDuration) || videoDuration <= 0) {
          throw new Error('Could not determine a valid video duration.');
      }
      console.log('Video duration calculated:', videoDuration);
      setDuration(videoDuration);
    } catch (err) {
      console.error("Duration calculation error:", err);
      setError(err.message || 'Could not read video duration. Please try a different file.');
      setVideoFile(null); // Invalidate file selection
      setDuration(null);
      e.target.value = null; // Reset file input visually
    } finally {
      setIsLoading(false); // Hide loading indicator
    }
  };

  const handleThumbnailFileChange = (e) => {
    setThumbnailFile(e.target.files[0]); // Get the first file
    setError(''); // Clear previous errors
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title || !videoFile || !thumbnailFile) {
      setError('Please provide a title, a video file, and a thumbnail file.');
      return;
    }

    if (duration === null || duration <= 0) { // Ensure duration is a positive number
      setError('Valid video duration is required. Please reselect the video file.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Upload Thumbnail
      console.log('Uploading thumbnail...');
      const thumbnailFileUpload = await storage.createFile(
        appwriteConfig.storageVideosBucketId, // bucketId
        ID.unique(),                          // fileId
        thumbnailFile                         // file
      );
      const thumbnailId = thumbnailFileUpload.$id;
      console.log('Thumbnail uploaded:', thumbnailId);

      // 2. Upload Video
      console.log('Uploading video...');
      const videoFileUpload = await storage.createFile(
        appwriteConfig.storageVideosBucketId, // bucketId
        ID.unique(),                          // fileId
        videoFile                             // file
      );
      const videoId = videoFileUpload.$id;
      console.log('Video uploaded:', videoId);

      // 3. Create Video Document in Database
      console.log('Creating database document...');
      await databases.createDocument(
        appwriteConfig.databaseId,            // databaseId
        appwriteConfig.videosCollectionId,    // collectionId
        ID.unique(),                          // documentId
        {                                     // data
          title: title,                       // string (required)
          video_id: videoId,                  // string (required)
          thumbnail_id: thumbnailId,          // string (required)
          video_duration: duration,           // integer (required)
          description: description || null,   // string (optional) - send null if empty
          // TODO: Add userId later if needed: user_id: user.$id
        }
      );
      console.log('Database document created.');

      setSuccess('Video uploaded successfully!');
      // Clear form
      setTitle('');
      setDescription('');
      setVideoFile(null);
      setThumbnailFile(null);
      setDuration(null);
      // Reset file inputs requires targeting them or resetting the form
      e.target.reset(); // Resets the form fields

      // Optionally navigate away after success
      // setTimeout(() => navigate('/'), 2000); // Example: Navigate home after 2s

    } catch (err) {
      console.error('Upload failed:', err);
      setError(`Upload failed: ${err.message || 'An unexpected error occurred.'}`);
      // Consider cleanup: If DB fails after storage succeeds, you might want to delete the uploaded files.
      // This adds complexity (requires storing IDs even if DB fails, then making delete calls).
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="upload-container">
      <h1>Upload Video</h1>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video Title"
            required
            disabled={isLoading}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="4"
            placeholder="Video Description"
            disabled={isLoading}
            className="form-textarea"
          ></textarea>
        </div>

        <div className="form-group">
          <label htmlFor="thumbnailFile">Thumbnail Image *</label>
          <input
            type="file"
            id="thumbnailFile"
            accept="image/png, image/jpeg, image/webp" // Accept common image types
            onChange={handleThumbnailFileChange}
            required
            disabled={isLoading}
            className="form-input"
          />
          {thumbnailFile && !error && <p className="file-info">Selected: {thumbnailFile.name}</p>}
        </div>

        <div className="form-group">
          <label htmlFor="videoFile">Video File *</label>
          <input
            type="file"
            id="videoFile"
            accept="video/mp4, video/webm, video/ogg" // Adjust accepted types as needed
            onChange={handleVideoFileChange}
            required
            disabled={isLoading}
            className="form-input"
          />
          {videoFile && !error && <p className="file-info">Selected: {videoFile.name}</p>}
          {duration && !error && <p className="file-info">Duration: {duration} seconds</p>}
        </div>

        <button type="submit" className="btn-primary" disabled={isLoading || (videoFile && duration === null)}>
          {isLoading ? 'Processing...' : 'Upload Video'}
        </button>
         {/* Message indicating duration calculation */}
         {videoFile && duration === null && !isLoading && !error &&
            <p className="form-info">Calculating video duration...</p>
         }
      </form>

      <style jsx>{`
        .upload-container {
          max-width: 800px;
          margin: 20px auto;
          padding: 20px;
          background-color: var(--background-alt, #fff); /* Use theme variable */
          border-radius: 8px;
          box-shadow: var(--shadow-light, 0 1px 3px rgba(0,0,0,0.1)); /* Use theme variable */
          color: var(--text-primary, #111); /* Use theme variable */
        }
        .upload-container h1 {
          margin-bottom: 24px;
          text-align: center;
          color: var(--text-primary, #111); /* Use theme variable */
        }
        .form-group {
          margin-bottom: 16px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }
        .form-input,
        .form-textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--border-color, #ccc); /* Use theme variable */
          border-radius: 4px;
          font-size: 16px;
          background-color: var(--background, #fff); /* Use theme variable */
          color: var(--text-primary, #111); /* Use theme variable */
          box-sizing: border-box; /* Include padding and border in width */
        }
        input[type="file"] {
            cursor: pointer;
        }
        textarea {
             resize: vertical;
             min-height: 80px;
         }
         button.btn-primary {
             display: block; /* Make button full width */
             width: 100%;
             margin-top: 24px;
             padding: 12px; /* Slightly larger padding */
             font-size: 1.1rem;
             background-color: var(--primary, #ff0000);
             color: var(--white, #fff);
             border: none;
             border-radius: 4px;
             cursor: pointer;
             transition: background-color 0.2s;
         }
         button.btn-primary:disabled {
             background-color: var(--gray, #ccc);
             cursor: not-allowed;
         }
         .file-info {
            font-size: 0.9em;
            color: var(--text-secondary, #555);
            margin-top: 4px;
         }
         .form-error {
            color: var(--error, red); /* Use theme variable */
            background-color: rgba(255, 0, 0, 0.1);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            border: 1px solid var(--error, red);
            font-size: 0.95em;
         }
         .form-success {
            color: var(--success, green); /* Use theme variable */
            background-color: rgba(0, 128, 0, 0.1);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            border: 1px solid var(--success, green);
            font-size: 0.95em;
         }
         .form-info {
             font-size: 0.9em;
             color: var(--text-secondary, #555);
             margin-top: 10px;
             text-align: center;
         }
      `}</style>
    </div>
  );
};

export default Upload;
