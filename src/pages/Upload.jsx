import React from 'react';

// Basic placeholder for Upload page
const Upload = () => {
  // TODO: Implement file input, form handling, progress indicator, API call

  return (
    <div className="upload-container">
      <h1>Upload Video</h1>
      <p>This is where the video upload form will go.</p>
      {/* Example input - replace with a proper component */}
      <div className="form-group">
         <label htmlFor="videoFile">Choose Video File:</label>
         <input type="file" id="videoFile" accept="video/*" />
      </div>
       <div className="form-group">
         <label htmlFor="title">Title:</label>
         <input type="text" id="title" placeholder="Video Title" />
      </div>
       <div className="form-group">
         <label htmlFor="description">Description:</label>
         <textarea id="description" rows="4" placeholder="Video Description"></textarea>
      </div>
      <button className="btn-primary">Upload</button>

      <style jsx>{`
        .upload-container {
          max-width: 800px;
          margin: 20px auto;
          padding: 20px;
          background-color: var(--white);
          border-radius: 8px;
          box-shadow: var(--shadow);
        }
        .upload-container h1 {
          margin-bottom: 24px;
          text-align: center;
        }
        .form-group {
          margin-bottom: 16px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }
        input[type="text"],
        input[type="file"],
        textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 16px;
        }
         textarea {
             resize: vertical;
         }
         button.btn-primary {
             display: block; /* Make button full width */
             width: 100%;
             margin-top: 24px;
         }
      `}</style>
    </div>
  );
};

export default Upload;
