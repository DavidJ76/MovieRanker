const express = require("express");
const pool = require("../db");

const router = express.Router();

// ==========================================
// 1. HELPER: VALIDATE MOVIE ID
// ==========================================

function validMovieId(id) {
  const number = Number(id);

  return (
    /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(number) && number > 0
  );
}

// ==========================================
// 2. GET MOVIE AVERAGE AND REVIEWS
// GET /api/movies/:movieId/ratings
// ==========================================

router.get("/:movieId/ratings", async (req, res) => {
  const movieId = req.params.movieId;

  if (!validMovieId(movieId)) {
    return res.status(400).json({
      error: "Invalid movie ID",
    });
  }

  try {
    // Calculate average score and rating count
    const [summaryRows] = await pool.execute(
      `SELECT
                ROUND(AVG(score), 2) AS average_rating,
                COUNT(*) AS rating_count
             FROM ratings
             WHERE movie_id = ?`,
      [movieId],
    );

    // Retrieve written reviews and usernames
    const [reviews] = await pool.execute(
      `SELECT
                u.username,
                r.score,
                r.review,
                r.updated_at
             FROM ratings r
             JOIN users u
                ON r.user_id = u.user_id
             WHERE r.movie_id = ?
                AND r.review IS NOT NULL
                AND TRIM(r.review) <> ''
             ORDER BY r.updated_at DESC
             LIMIT 50`,
      [movieId],
    );

    res.json({
      average_rating: summaryRows[0].average_rating,
      rating_count: summaryRows[0].rating_count,
      reviews: reviews,
    });
  } catch (error) {
    console.error("Get ratings error:", error);

    res.status(500).json({
      error: "Failed to retrieve ratings",
    });
  }
});

// ==========================================
// 3. GET LOGGED-IN USER'S RATING
// GET /api/movies/:movieId/my-rating
// ==========================================

router.get("/:movieId/my-rating", async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "You must log in",
    });
  }

  const movieId = req.params.movieId;

  if (!validMovieId(movieId)) {
    return res.status(400).json({
      error: "Invalid movie ID",
    });
  }

  try {
    const [ratings] = await pool.execute(
      `SELECT
                rating_id,
                score,
                review
             FROM ratings
             WHERE user_id = ?
               AND movie_id = ?`,
      [req.session.userId, movieId],
    );

    res.json({
      rating: ratings.length > 0 ? ratings[0] : null,
    });
  } catch (error) {
    console.error("My rating error:", error);

    res.status(500).json({
      error: "Failed to retrieve your rating",
    });
  }
});

// ==========================================
// 4. SUBMIT OR UPDATE RATING
// POST /api/movies/:movieId/ratings
// ==========================================

router.post("/:movieId/ratings", async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "You must log in to rate movies",
    });
  }

  const movieId = req.params.movieId;
  const { score, review } = req.body || {};

  // Validate movie ID
  if (!validMovieId(movieId)) {
    return res.status(400).json({
      error: "Invalid movie ID",
    });
  }

  // Validate numerical rating
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return res.status(400).json({
      error: "Rating must be a whole number from 1 to 10",
    });
  }

  // Validate written review
  if (review !== undefined && review !== null && typeof review !== "string") {
    return res.status(400).json({
      error: "Review must be text",
    });
  }

  const cleanReview = (review || "").trim();

  if (cleanReview.length > 2000) {
    return res.status(400).json({
      error: "Review cannot exceed 2000 characters",
    });
  }

  try {
    // Check that the movie exists
    const [movies] = await pool.execute(
      `SELECT movie_id
             FROM movies
             WHERE movie_id = ?`,
      [movieId],
    );

    if (movies.length === 0) {
      return res.status(404).json({
        error: "Movie not found",
      });
    }

    // Insert a rating or update an existing rating
    await pool.execute(
      `INSERT INTO ratings
                (user_id, movie_id, score, review)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                score = ?,
                review = ?,
                updated_at = CURRENT_TIMESTAMP`,
      [
        req.session.userId,
        movieId,
        score,
        cleanReview || null,
        score,
        cleanReview || null,
      ],
    );

    res.json({
      message: "Rating saved successfully!",
    });
  } catch (error) {
    console.error("Save rating error:", error);

    res.status(500).json({
      error: "Failed to save rating",
    });
  }
});

// ==========================================
// 5. DELETE WRITTEN REVIEW ONLY
// DELETE /api/movies/:movieId/review
// ==========================================

router.delete("/:movieId/review", async (req, res) => {
  console.log("DELETE REVIEW endpoint reached:", req.params.movieId);

  // Check authentication
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "You must log in to delete reviews",
    });
  }

  const movieId = req.params.movieId;
  const userId = req.session.userId;

  // Validate movie ID
  if (!validMovieId(movieId)) {
    return res.status(400).json({
      error: "Invalid movie ID",
    });
  }

  try {
    // Remove review text while keeping score
    const [result] = await pool.execute(
      `UPDATE ratings
             SET
                review = NULL,
                updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?
               AND movie_id = ?
               AND review IS NOT NULL
               AND TRIM(review) <> ''`,
      [userId, movieId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "No written review found for this movie",
      });
    }

    console.log(`Written review deleted for movie ${movieId}`);

    res.json({
      message: "Review deleted. Your numerical rating was kept.",
    });
  } catch (error) {
    console.error("Delete review error:", error);

    res.status(500).json({
      error: "Failed to delete review",
    });
  }
});

// ==========================================
// 6. DELETE ENTIRE RATING AND REVIEW
// DELETE /api/movies/:movieId/ratings
// ==========================================

router.delete("/:movieId/ratings", async (req, res) => {
  console.log("DELETE RATING endpoint reached:", req.params.movieId);

  // Check authentication
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "You must log in to delete ratings",
    });
  }

  const movieId = req.params.movieId;
  const userId = req.session.userId;

  // Validate movie ID
  if (!validMovieId(movieId)) {
    return res.status(400).json({
      error: "Invalid movie ID",
    });
  }

  try {
    // Delete rating belonging to logged-in user
    const [result] = await pool.execute(
      `DELETE FROM ratings
             WHERE user_id = ?
               AND movie_id = ?`,
      [userId, movieId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "You have not rated this movie",
      });
    }

    console.log(`Rating deleted for movie ${movieId}`);

    res.json({
      message: "Rating and review deleted successfully!",
    });
  } catch (error) {
    console.error("Delete rating error:", error);

    res.status(500).json({
      error: "Failed to delete rating",
    });
  }
});

// ==========================================
// 7. EXPORT ROUTER
// ==========================================

console.log("MovieRanker ratings routes loaded.");

module.exports = router;
