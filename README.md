[README.md](https://github.com/user-attachments/files/34933901/README.md)
# MovieRanker

**A full-stack movie discovery, rating, and review platform built with Node.js, Express, and MySQL.**

MovieRanker lets visitors discover movies and explore community rankings. Registered users can rate films, write reviews, manage their ratings, and track their activity through a personal profile. The application combines a responsive JavaScript frontend with RESTful API routes, session-based authentication, and a relational database.

## Features

- **Movie discovery:** Search movies, explore trending titles, and open individual movie detail pages without an account.
- **User authentication:** Register, sign in, and sign out with password hashing and server-managed sessions.
- **Ratings and reviews:** Submit a score from 1–10 and an optional written review. Each account can maintain one editable rating per movie.
- **Community rankings:** View a Top 10 leaderboard calculated from user-submitted ratings, rather than static scores.
- **User profiles:** Review personal rating history and update or remove ratings and reviews.
- **Responsive interface:** Dark-themed UI built with HTML, CSS, and vanilla JavaScript.

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | HTML5, CSS3, JavaScript (Fetch API) |
| Backend | Node.js, Express.js |
| Database | MySQL, mysql2 |
| Authentication | bcryptjs, express-session, express-mysql-session |
| Movie discovery | Third-party movie catalog API |
| Development | Git, GitHub, npm, nodemon |


The Express backend handles input validation, authentication, and rating operations. MySQL stores application data, while the browser dynamically renders search results, movie details, and community rankings. API credentials and database configuration are kept in environment variables rather than client-side code.

## Project Structure

```text
MovieRanker/
├── public/
│   ├── css/             # Shared styles
│   ├── js/              # Browser-side logic
│   └── *.html           # Website pages
├── routes/
│   ├── auth.js          # Account endpoints
│   ├── ratings.js       # Ratings and reviews
│   ├── profile.js       # Profile endpoints
├── db.js                # MySQL connection pool
├── server.js            # Express application
└── package.json
```

## Running Locally

**Requirements:** Node.js 22+, npm, and a running MySQL server.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/DavidJ76/MovieRanker.git
   cd MovieRanker
   npm install
   ```

2. Configure the MySQL database with the `users`, `movies`, and `ratings` tables and their relationships.
3. Create a local `.env` file with the database credentials, a session secret, and any required movie-catalog API credentials. **Do not commit `.env`.**
4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open **http://localhost:3000**.

> **Setup note:** This repository currently requires a locally configured MySQL schema and environment variables. A reusable schema script and `.env.example` are planned to make setup easier for other developers.

## In Development

- AI-assisted movie recommendations based on a user's rating history and written reviews.
- Evaluation of recommendation quality using labelled test data.
- Cloud deployment and a public demo URL.

These features are **planned** and are not claimed as part of the current implementation.

## Repository

[GitHub — DavidJ76/MovieRanker](https://github.com/DavidJ76/MovieRanker)
