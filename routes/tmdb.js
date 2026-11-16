"use strict";
// TMDB integration (Node.js 18+). Your secret stays on this server.
const express = require("express");
const pool = require("../db");
const router = express.Router();

const TMDB_API = "https://api.themoviedb.org/3";
const token = () => (process.env.TMDB_READ_TOKEN || "").trim();
const validId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const posterUrl = path =>
    typeof path === "string" && /^\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(path)
        ? `https://image.tmdb.org/t/p/w500${path}`
        : null;

async function requestTMDB(path, params = {}) {
    if (!token()) {
        const error = new Error("TMDB_READ_TOKEN is not configured in .env.");
        error.status = 503;
        throw error;
    }
    const url = new URL(`${TMDB_API}${path}`);
    url.searchParams.set("language", "en-US");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

    let response;
    try {
        response = await fetch(url, {
            headers: { Authorization: `Bearer ${token()}`, accept: "application/json" },
            signal: AbortSignal.timeout(10000)
        });
    } catch (error) {
        const failure = new Error("TMDB is unavailable or timed out.");
        failure.status = 502;
        throw failure;
    }
    if (!response.ok) {
        const failure = new Error(response.status === 401
            ? "TMDB rejected your API Read Access Token."
            : response.status === 429
                ? "TMDB request limit reached. Try again shortly."
                : `TMDB returned HTTP ${response.status}.`);
        failure.status = response.status === 429 ? 429 : 502;
        throw failure;
    }
    return response.json();
}

function listItem(movie) {
    return {
        tmdb_id: movie.id,
        title: movie.title,
        release_year: /^\d{4}/.test(movie.release_date || "")
            ? Number(movie.release_date.slice(0, 4)) : null,
        description: movie.overview || "",
        poster_path: posterUrl(movie.poster_path)
    };
}

function handleTMDBError(res, error) {
    console.error("TMDB request failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "TMDB request failed." });
}

router.get("/status", (req, res) => {
    res.json({ enabled: Boolean(token()) });
});

router.get("/search", async (req, res) => {
    const query = req.query.query;
    if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) {
        return res.status(400).json({ error: "Search must be 2 to 100 characters." });
    }
    try {
        const data = await requestTMDB("/search/movie", {
            query: query.trim(), include_adult: "false", page: "1"
        });
        res.json({ results: (data.results || []).filter(m => !m.adult).slice(0, 18).map(listItem) });
    } catch (error) { return handleTMDBError(res, error); }
});

router.get("/popular", async (req, res) => {
    try {
        const data = await requestTMDB("/movie/popular", { page: "1" });
        res.json({ results: (data.results || []).filter(m => !m.adult).slice(0, 12).map(listItem) });
    } catch (error) { return handleTMDBError(res, error); }
});

// Only a logged-in user can add a movie. No client-provided metadata is trusted.
router.post("/import", async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: "Log in to add a movie from TMDB." });
    }
    const tmdbId = req.body?.tmdb_id;
    if (!validId(tmdbId)) {
        return res.status(400).json({ error: "Invalid TMDB movie ID." });
    }
    try {
        // Import always uses authoritative TMDB details, not a title/URL sent by a browser.
        const data = await requestTMDB(`/movie/${Number(tmdbId)}`);
        const movie = listItem(data);
        if (!movie.title || typeof movie.title !== "string") {
            return res.status(502).json({ error: "TMDB supplied invalid movie information." });
        }

        const [existing] = await pool.execute(
            "SELECT movie_id FROM movies WHERE tmdb_id = ?", [movie.tmdb_id]
        );
        if (existing.length) return res.json({ movie_id: existing[0].movie_id, added: false });

        // If a single manually-added movie has the same exact title/year, link it
        // rather than creating a duplicate or losing ratings attached to its movie_id.
        if (movie.release_year !== null) {
            const [manualMatches] = await pool.execute(
                `SELECT movie_id FROM movies
                 WHERE title = ? AND release_year = ? AND tmdb_id IS NULL LIMIT 2`,
                [movie.title.slice(0, 255), movie.release_year]
            );
            if (manualMatches.length > 1) {
                return res.status(409).json({
                    error: "Multiple manual movies match this title and year. Link them manually first."
                });
            }
            if (manualMatches.length === 1) {
                const id = manualMatches[0].movie_id;
                await pool.execute(
                    `UPDATE movies SET tmdb_id = ?,
                        poster_path = IF(poster_path IS NULL OR poster_path = '', ?, poster_path),
                        description = IF(description IS NULL OR description = '', ?, description)
                     WHERE movie_id = ? AND tmdb_id IS NULL`,
                    [movie.tmdb_id, movie.poster_path, movie.description, id]
                );
                return res.json({ movie_id: id, added: false, linked_manual: true });
            }
        }

        const [result] = await pool.execute(
            `INSERT INTO movies (title, release_year, description, poster_path, tmdb_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE movie_id = LAST_INSERT_ID(movie_id)`,
            [movie.title.slice(0, 255), movie.release_year, movie.description.slice(0, 60000),
                movie.poster_path, movie.tmdb_id]
        );
        res.json({ movie_id: result.insertId, added: result.affectedRows === 1 });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            const [rows] = await pool.execute(
                "SELECT movie_id FROM movies WHERE tmdb_id = ?", [Number(tmdbId)]
            );
            if (rows.length) return res.json({ movie_id: rows[0].movie_id, added: false });
        }
        return handleTMDBError(res, error);
    }
});

// MOVIERANKER TRENDING ROUTE START
// GET /api/tmdb/trending — five movies trending over the past week.
router.get("/trending", async (req, res) => {
    try {
        const data = await requestTMDB("/trending/movie/week", { page: 1 });
        const movies = (data.results || [])
            .filter(movie => movie && !movie.adult && movie.id && movie.title)
            .slice(0, 5)
            .map(movie => ({
                tmdb_id: movie.id,
                title: movie.title,
                release_year: /^\d{4}/.test(movie.release_date || "")
                    ? Number(movie.release_date.slice(0, 4)) : null,
                description: movie.overview || "",
                poster_path: typeof movie.poster_path === "string" &&
                    /^\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(movie.poster_path)
                    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
            }));
        res.json({ results: movies });
    } catch (error) {
        console.error("TMDB trending request failed:", error.message);
        res.status(error.status || 502).json({
            error: error.message || "Unable to load trending movies."
        });
    }
});
// MOVIERANKER TRENDING ROUTE END

// Public movie details. Unlike /import, this endpoint NEVER writes to the DB.
// If an already-imported movie exists, return its local ID so guests can
// view MovieRanker ratings and reviews from the existing movie page.
router.get("/movie/:id", async (req, res) => {
    const tmdbId = req.params.id;
    if (!validId(tmdbId)) {
        return res.status(400).json({ error: "Invalid TMDB movie ID." });
    }
    try {
        const [details, rows] = await Promise.all([
            requestTMDB(`/movie/${Number(tmdbId)}`),
            pool.execute(
                "SELECT movie_id FROM movies WHERE tmdb_id = ? LIMIT 1",
                [Number(tmdbId)]
            )
        ]);
        res.json({
            ...listItem(details),
            movie_id: rows[0].length ? rows[0][0].movie_id : null
        });
    } catch (error) {
        return handleTMDBError(res, error);
    }
});

module.exports = router;
