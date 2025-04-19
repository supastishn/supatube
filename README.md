# React + Appwrite YouTube Clone

A YouTube clone built using React, Vite, and Appwrite for the backend.

## Features (Planned)

- User Authentication (Sign up, Sign in, Sign out)
- Video Uploading
- Video Browsing & Searching
- Video Playback
- User Profiles
- Liking/Disliking Videos (Optional)
- Comments (Optional)

## Tech Stack

- **Frontend:** React, React Router, Vite
- **Backend:** Appwrite (Cloud or Self-Hosted)
- **Styling:** CSS (or choose a library like Tailwind CSS later)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd react-appwrite-youtube-clone
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Appwrite:**
    - Create an Appwrite project (cloud.appwrite.io or self-hosted).
    - Create the necessary Database, Collections (Users, Videos), and Storage Bucket.
    - Update the placeholder IDs in `src/lib/appwriteConfig.js` with your actual Appwrite Project ID, Endpoint, Database ID, Collection IDs, and Storage Bucket ID.
    *Consider using environment variables (`.env`) for security.*
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open your browser to the specified local URL (usually `http://localhost:5173`).

## Appwrite Setup

You need to configure the following in your Appwrite project:

- **Authentication:** Enable Email/Password or other providers as needed.
- **Database:**
    - Create a Database (e.g., `youtube_clone_db`).
    - Create Collections:
        - `users` (Store additional user info like profile picture URL, name). Define attributes and permissions.
        - `videos` (Store video title, description, uploader ID, video file ID, thumbnail ID, etc.). Define attributes and permissions.
- **Storage:**
    - Create a Bucket (e.g., `videos`) to store video files and thumbnails. Configure file size limits and permissions.
- **Functions (Optional):** If custom server-side logic is needed later (e.g., video processing), create functions in the `functions` directory and deploy them via the Appwrite CLI.

## Contributing

Contributions are welcome! Please follow standard Git workflow (fork, branch, pull request).
