const express = require("express");
const pool = require("../db");

const router = express.Router();

// ==========================================
// GET LOGGED-IN USER'S PROFILE
// ==========================================

router.get("/", async (req, res) => {
  // Check authentication.
  if (!req.session.userId) {
    return res.status(401).json({
      error: "You must log in to view your profile.",
    });
  }

  try {
    const userId = req.session.userId;

    // Retrieve user information.
    const [users] = await pool.execute(
      `SELECT
                user_id,
                username,
                email,
                created_at
             FROM users
             WHERE user_id = ?`,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    // Retrieve movies rated by this user.
    const [ratings] = await pool.execute(
      `SELECT
                r.rating_id,
                r.movie_id,
                m.title,
                m.release_year,
                m.poster_path,
                r.score,
                r.review,
                r.created_at,
                r.updated_at
             FROM ratings r
             INNER JOIN movies m
                 ON r.movie_id = m.movie_id
             WHERE r.user_id = ?
             ORDER BY r.updated_at DESC, r.rating_id DESC`,
      [userId],
    );

    res.json({
      user: users[0],
      ratings: ratings,
    });
  } catch (error) {
    console.error("Profile error:", error);

    res.status(500).json({
      error: "Failed to load profile.",
    });
  }
});

module.exports = router;
