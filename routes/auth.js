const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (
    typeof username !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return res.status(400).json({
      error: "All fields are required.",
    });
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: "Username must be 3-30 letters, numbers or underscores.",
    });
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
    cleanEmail.length > 255
  ) {
    return res.status(400).json({
      error: "Enter a valid email address.",
    });
  }

  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      error: "Password must be at least 8 characters and at most 72 bytes.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.execute(
      `INSERT INTO users
             (username, email, password_hash)
             VALUES (?, ?, ?)`,
      [cleanUsername, cleanEmail, passwordHash],
    );

    res.status(201).json({
      message: "Registration successful!",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Username or email already exists.",
      });
    }

    console.error(error);
    res.status(500).json({
      error: "Registration failed.",
    });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  try {
    const [users] = await pool.execute("SELECT * FROM users WHERE email = ?", [
      email.trim().toLowerCase(),
    ]);

    if (users.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const user = users[0];

    const matches = await bcrypt.compare(password, user.password_hash);

    if (!matches) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    // Create a fresh session after successful login.
    req.session.regenerate((error) => {
      if (error) {
        return res.status(500).json({
          error: "Could not create session.",
        });
      }

      req.session.userId = user.user_id;

      req.session.save((error) => {
        if (error) {
          return res.status(500).json({
            error: "Could not save session.",
          });
        }

        res.json({
          message: "Login successful!",
          user: {
            user_id: user.user_id,
            username: user.username,
          },
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Login failed.",
    });
  }
});

// CHECK CURRENT USER
router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Not logged in.",
    });
  }

  try {
    const [users] = await pool.execute(
      "SELECT user_id, username, email FROM users WHERE user_id = ?",
      [req.session.userId],
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: "User not found.",
      });
    }

    res.json({ user: users[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not retrieve user.",
    });
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        error: "Logout failed.",
      });
    }

    res.clearCookie("movieranker.sid", { path: "/" });

    res.json({
      message: "Logged out successfully!",
    });
  });
});

module.exports = router;
