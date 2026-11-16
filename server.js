require("dotenv").config();

// ==========================================
// 1. IMPORT PACKAGES
// ==========================================

const express = require("express");
const path = require("path");
const pool = require("./db");

const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

// Import route files
const authRoutes = require("./routes/auth");
const ratingsRoutes = require("./routes/ratings");
const tmdbRoutes = require("./routes/tmdb");
const profileRoutes = require("./routes/profile");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 2. MIDDLEWARE
// ==========================================

// Parse incoming JSON requests
app.use(express.json());

// Parse form submissions
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 3. SESSION CONFIGURATION
// ==========================================

const sessionStore = new MySQLStore({}, pool);

app.use(
  session({
    name: "movieranker.sid",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

// ==========================================
// 4. AUTHENTICATION ROUTES
// ==========================================

// POST /api/register
// POST /api/login
// POST /api/logout
// GET  /api/me

app.use("/api", authRoutes);

// ==========================================
// 5. RATINGS AND REVIEWS ROUTES
// ==========================================

// GET    /api/movies/:movieId/ratings
// GET    /api/movies/:movieId/my-rating
// POST   /api/movies/:movieId/ratings
// DELETE /api/movies/:movieId/review
// DELETE /api/movies/:movieId/ratings

app.use(
  "/api/movies",
  (req, res, next) => {
    console.log("Ratings router reached:", req.method, req.originalUrl);
    next();
  },
  ratingsRoutes,
);

// ==========================================
// 6. USER PROFILE ROUTES
// ==========================================

// GET /api/profile
app.use("/api/profile", profileRoutes);
app.use("/api/tmdb", tmdbRoutes);
// ==========================================
// 7. SERVE FRONTEND FILES
// ==========================================

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// 8. TEST EXPRESS SERVER
// ==========================================

app.get("/api/hello", (req, res) => {
  res.json({
    message: "MovieRanker server is working!",
  });
});

// ==========================================
// 9. TEST MYSQL CONNECTION
// ==========================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      server: "working",
      database: "connected",
    });
  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      server: "working",
      database: "disconnected",
    });
  }
});

// ==========================================
// 10. GET ALL MOVIES / SEARCH / SORT
// ==========================================

app.get("/api/movies", async (req, res) => {
  try {
    const search = req.query.search ?? "";
    const sort = req.query.sort ?? "az";

    // Validate search
    if (typeof search !== "string" || search.length > 100) {
      return res.status(400).json({
        error: "Invalid search query",
      });
    }

    // Validate sort option
    if (!["az", "top", "newest"].includes(sort)) {
      return res.status(400).json({
        error: "Invalid sorting option",
      });
    }

    // Retrieve movies and calculated averages
    let sql = `
            SELECT
                m.movie_id,
                m.title,
                m.release_year,
                m.description,
                m.poster_path,
                m.tmdb_id,
                r.average_rating,
                COALESCE(r.rating_count, 0) AS rating_count

            FROM movies m

            LEFT JOIN (
                SELECT
                    movie_id,
                    ROUND(AVG(score), 2) AS average_rating,
                    COUNT(*) AS rating_count
                FROM ratings
                GROUP BY movie_id
            ) r ON m.movie_id = r.movie_id

            WHERE m.title LIKE ?
        `;

    const values = [`%${search.trim()}%`];

    // Sorting
    if (sort === "top") {
      sql += `
                AND r.rating_count > 0
                ORDER BY
                    r.average_rating DESC,
                    r.rating_count DESC,
                    m.title ASC
            `;
    } else if (sort === "newest") {
      sql += `
                ORDER BY
                    m.release_year DESC,
                    m.title ASC
            `;
    } else {
      sql += `
                ORDER BY m.title ASC
            `;
    }

    sql += " LIMIT 100";

    const [movies] = await pool.execute(sql, values);

    res.json(movies);
  } catch (error) {
    console.error("Movie retrieval error:", error);

    res.status(500).json({
      error: "Failed to retrieve movies",
    });
  }
});

// ==========================================
// 11. GET INDIVIDUAL MOVIE
// ==========================================

app.get("/api/movies/:id", async (req, res) => {
  try {
    const movieId = Number(req.params.id);

    // Validate ID
    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
      return res.status(400).json({
        error: "Invalid movie ID",
      });
    }

    // Retrieve individual movie
    const [movies] = await pool.execute(
      "SELECT * FROM movies WHERE movie_id = ?",
      [movieId],
    );

    if (movies.length === 0) {
      return res.status(404).json({
        error: "Movie not found",
      });
    }

    res.json(movies[0]);
  } catch (error) {
    console.error("Individual movie error:", error);

    res.status(500).json({
      error: "Failed to retrieve movie",
    });
  }
});

// ==========================================
// 12. UNKNOWN API ROUTES
// ==========================================

app.use("/api", (req, res) => {
  console.log("API route not found:", req.method, req.originalUrl);

  res.status(404).json({
    error: "API endpoint not found",
  });
});

// ==========================================
// 13. ERROR HANDLING
// ==========================================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  res.status(error.status || 500).json({
    error:
      error.status === 400 ? "Invalid request data." : "Internal server error.",
  });
});

// ==========================================
// 14. START EXPRESS SERVER
// ==========================================

async function startServer() {
  try {
    // Verify MySQL connection
    await pool.query("SELECT 1");

    // Wait for session storage to initialize
    await sessionStore.onReady();

    console.log("Connected to MySQL successfully!");

    // Start listening
    app.listen(PORT, () => {
      console.log(`MovieRanker running at http://localhost:${PORT}`);

      console.log("Authentication, ratings, and profile routes loaded.");
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);

    process.exit(1);
  }
}

startServer();
