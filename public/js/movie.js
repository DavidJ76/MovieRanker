// Handles movie detail page and the rating/review form.
const movieParams = new URLSearchParams(window.location.search);
const movieId = movieParams.get("id");
const tmdbId = movieParams.get("tmdb_id");

function displayStars(element, score) {
    const value = Number(score) || 0;
    element.style.setProperty("--fill", `${Math.max(0, Math.min(100, value * 10))}%`);
    element.setAttribute("aria-label", value === 0
        ? "Not rated"
        : `${value} out of 10, or ${value / 2} out of 5 stars`);
}

// Display the poster, title and description for both local and TMDB movies.
function showMovieDetails(movie) {
    document.getElementById("movieTitle").textContent = movie.title || "Untitled movie";
    document.getElementById("movieYear").textContent = movie.release_year || "Unknown year";
    document.getElementById("movieDescription").textContent = movie.description || "No description available.";
    document.title = `${movie.title || "Movie"} - MovieRanker`;
    const poster = document.getElementById("moviePoster");
    const placeholder = document.getElementById("posterPlaceholder");
    if (movie.poster_path) {
        poster.onload = () => { poster.hidden = false; placeholder.hidden = true; };
        poster.onerror = () => { poster.hidden = true; placeholder.hidden = false; };
        poster.src = movie.poster_path;
        poster.alt = `${movie.title} poster`;
    } else {
        poster.hidden = true;
        placeholder.hidden = false;
    }
    document.getElementById("movieMessage").hidden = true;
    document.getElementById("movieDetail").hidden = false;
}

function validId(id) {
    return /^[1-9]\d*$/.test(id || "") && Number.isSafeInteger(Number(id));
}

async function showUnimportedMovie(tmdbMovie) {
    // TMDB-only movies have no MovieRanker ratings or reviews yet.
    document.getElementById("averageScore").textContent = "Not rated yet";
    document.getElementById("ratingCount").textContent = "0 ratings";
    document.getElementById("reviewList").textContent = "No MovieRanker reviews yet.";
    displayStars(document.getElementById("averageStars"), 0);

    const form = document.getElementById("ratingForm");
    const guest = document.getElementById("guestPrompt");
    const status = document.getElementById("ratingStatus");
    form.hidden = true;
    guest.hidden = true;
    status.textContent = "";

    // Only checking login status here; viewing the page needs no account.
    let me;
    try {
        me = await fetch("/api/me", { cache: "no-store" });
    } catch (error) {
        // A login-status failure should never hide public movie details.
        status.textContent = "Could not check login status. Refresh to try rating this movie.";
        return;
    }
    if (me.status === 401) {
        guest.hidden = false;
        return;
    }
    if (!me.ok) {
        status.textContent = "Could not check login status. Refresh to try rating this movie.";
        return;
    }

    status.textContent = "Add this movie to MovieRanker to leave your rating and review.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-action";
    button.textContent = "Add to MovieRanker & rate";
    status.after(button);
    button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "Adding movie to MovieRanker…";
        try {
            const response = await fetch("/api/tmdb/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tmdb_id: tmdbMovie.tmdb_id })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Could not add movie.");
            if (!validId(String(data.movie_id))) throw new Error("Invalid movie ID returned.");
            window.location.assign(`/movie.html?id=${data.movie_id}`);
        } catch (error) {
            button.disabled = false;
            status.textContent = error.message || "Unable to add movie.";
            if (/log in|login|unauthorized/i.test(error.message || "")) {
                button.hidden = true;
                guest.hidden = false;
            }
        }
    });
}

async function loadMovieDetails() {
    const message = document.getElementById("movieMessage");
    try {
        if (movieId !== null) {
            if (!validId(movieId)) throw new Error("Invalid movie ID.");
            const response = await fetch(`/api/movies/${movieId}`);
            if (!response.ok) throw new Error("Movie not found.");
            const movie = await response.json();
            showMovieDetails(movie);
            await Promise.all([loadRatings(), loadMyRating()]);
        } else if (tmdbId !== null) {
            if (!validId(tmdbId)) throw new Error("Invalid TMDB movie ID.");
            // Public, read-only request. Nothing is written to MySQL.
            const response = await fetch(`/api/tmdb/movie/${tmdbId}`);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "TMDB movie not found.");
            }
            const movie = await response.json();
            if (validId(String(movie.movie_id || ""))) {
                // Already in MovieRanker: show existing average and reviews.
                window.location.replace(`/movie.html?id=${movie.movie_id}`);
                return;
            }
            showMovieDetails(movie);
            await showUnimportedMovie(movie);
        } else {
            throw new Error("Missing movie ID.");
        }
    } catch (error) {
        console.error(error);
        message.hidden = false;
        message.textContent = error.message || "Unable to load this movie.";
    }
}

async function loadRatings() {
    const averageScore = document.getElementById("averageScore");
    const ratingCount = document.getElementById("ratingCount");
    const averageStars = document.getElementById("averageStars");
    const reviewList = document.getElementById("reviewList");
    try {
        const response = await fetch(`/api/movies/${movieId}/ratings`);
        if (!response.ok) throw new Error("Failed to load ratings");
        const data = await response.json();
        if (data.average_rating === null) {
            averageScore.textContent = "Not rated yet";
            displayStars(averageStars, 0);
        } else {
            const average = Number(data.average_rating);
            averageScore.textContent = `${average.toFixed(2)}/10`;
            displayStars(averageStars, average);
        }
        const count = Number(data.rating_count);
        ratingCount.textContent = `${count} ${count === 1 ? "rating" : "ratings"}`;
        reviewList.replaceChildren();
        if (!data.reviews.length) {
            reviewList.textContent = "No written reviews yet.";
            return;
        }
        data.reviews.forEach(review => {
            const card = document.createElement("article");
            card.className = "review-card";
            const username = document.createElement("h3");
            username.textContent = review.username;
            const score = document.createElement("p");
            score.textContent = `${review.score}/10`;
            const stars = document.createElement("span");
            stars.className = "stars small-stars";
            stars.setAttribute("role", "img");
            displayStars(stars, review.score);
            const text = document.createElement("p");
            text.textContent = review.review;
            const date = document.createElement("small");
            if (review.updated_at) {
                const updated = new Date(review.updated_at);
                if (!Number.isNaN(updated.getTime())) date.textContent = updated.toLocaleDateString();
            }
            card.append(username, score, stars, text, date);
            reviewList.appendChild(card);
        });
    } catch (error) {
        console.error(error);
        reviewList.textContent = "Unable to load reviews.";
        averageScore.textContent = "Rating unavailable";
    }
}

async function loadMyRating() {
    const form = document.getElementById("ratingForm");
    const guest = document.getElementById("guestPrompt");
    const status = document.getElementById("ratingStatus");
    try {
        const response = await fetch(`/api/movies/${movieId}/my-rating`, { cache: "no-store" });
        if (response.status === 401) {
            guest.hidden = false;
            form.hidden = true;
            status.textContent = "";
            return;
        }
        if (!response.ok) throw new Error("Failed to check your rating");
        const data = await response.json();
        guest.hidden = true;
        form.hidden = false;
        status.textContent = "";
        const input = document.getElementById("ratingInput");
        const review = document.getElementById("reviewInput");
        const button = document.getElementById("ratingSubmit");
        if (data.rating) {
            input.value = data.rating.score;
            review.value = data.rating.review || "";
            button.textContent = "Update Rating";
        } else {
            input.value = 7;
            review.value = "";
            button.textContent = "Submit Rating";
        }
        updateRatingPreview();
    } catch (error) {
        console.error(error);
        form.hidden = true;
        status.textContent = "Unable to check your rating. Please refresh.";
    }
}

function updateRatingPreview() {
    const score = Number(document.getElementById("ratingInput").value);
    document.getElementById("selectedRating").textContent = `${score}/10`;
    displayStars(document.getElementById("yourStars"), score);
}
document.getElementById("ratingInput").addEventListener("input", updateRatingPreview);

document.getElementById("ratingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const score = Number(document.getElementById("ratingInput").value);
    const review = document.getElementById("reviewInput").value;
    const message = document.getElementById("formMessage");
    const button = document.getElementById("ratingSubmit");
    button.disabled = true;
    message.textContent = "Saving...";
    try {
        const response = await fetch(`/api/movies/${movieId}/ratings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score, review })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to save rating.");
        message.textContent = "Rating saved successfully!";
        await Promise.all([loadRatings(), loadMyRating()]);
        if (typeof refreshRatingActions === "function") await refreshRatingActions();
    } catch (error) {
        console.error(error);
        message.textContent = error.message || "Could not save rating.";
    } finally {
        button.disabled = false;
    }
});
loadMovieDetails();
