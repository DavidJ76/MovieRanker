const profileMessage = document.getElementById("profileMessage");
const profileContent = document.getElementById("profileContent");
const actionFeedback = document.getElementById("actionFeedback");
const myRatings = document.getElementById("myRatings");

// ==========================================
// 1. HELPER: FORMAT DATES
// ==========================================

function formatProfileDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString();
}

// ==========================================
// 2. HELPER: CREATE STARS
// ==========================================

function createProfileStars(score) {
  const stars = document.createElement("span");

  stars.className = "stars";
  stars.setAttribute("role", "img");

  stars.style.setProperty("--fill", `${Number(score) * 10}%`);

  stars.setAttribute("aria-label", `${score} out of 10`);

  return stars;
}

// ==========================================
// 3. DELETE REVIEW OR RATING
// ==========================================

async function deleteProfileEntry(movieId, reviewOnly) {
  const confirmation = reviewOnly
    ? "Remove your written review? Your numerical rating will stay."
    : "Delete your rating and written review? This cannot be undone.";

  if (!window.confirm(confirmation)) {
    return;
  }

  actionFeedback.textContent = "Processing...";

  const endpoint = reviewOnly
    ? `/api/movies/${movieId}/review`
    : `/api/movies/${movieId}/ratings`;

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not delete the entry.");
    }

    // Reload profile after successful deletion.
    await loadProfile();

    actionFeedback.textContent = data.message;
  } catch (error) {
    console.error(error);
    actionFeedback.textContent = error.message;
  }
}

// ==========================================
// 4. CREATE ONE RATING CARD
// ==========================================

function createProfileRatingCard(movie) {
  const card = document.createElement("article");
  card.className = "profile-rating-card";

  // Poster
  const posterArea = document.createElement("div");
  posterArea.className = "profile-poster";

  const placeholder = document.createElement("div");
  placeholder.className = "profile-poster-placeholder";
  placeholder.textContent = "No Poster";

  posterArea.appendChild(placeholder);

  if (movie.poster_path) {
    const image = document.createElement("img");
    image.src = movie.poster_path;
    image.alt = `${movie.title} poster`;
    image.loading = "lazy";

    image.onerror = () => {
      image.remove();
      placeholder.hidden = false;
    };

    image.onload = () => {
      placeholder.hidden = true;
    };

    posterArea.appendChild(image);
  }

  // Main content
  const content = document.createElement("div");
  content.className = "profile-rating-content";

  const title = document.createElement("a");
  title.className = "profile-movie-title";
  title.href = `/movie.html?id=${movie.movie_id}`;
  title.textContent = `${movie.title} (${movie.release_year || "Unknown"})`;

  const scoreLine = document.createElement("div");
  scoreLine.className = "profile-score-line";

  const score = document.createElement("strong");
  score.textContent = `${movie.score}/10`;

  scoreLine.append(score, createProfileStars(movie.score));

  const review = document.createElement("p");
  review.className = "profile-review-text";

  const hasReview = Boolean(movie.review && movie.review.trim());

  review.textContent = hasReview ? movie.review : "No written review.";

  const date = document.createElement("small");
  date.className = "profile-date";
  date.textContent = `Last updated: ${formatProfileDate(movie.updated_at)}`;

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "profile-actions";

  // Edit
  const editLink = document.createElement("a");
  editLink.href = `/movie.html?id=${movie.movie_id}`;
  editLink.textContent = "Edit";
  editLink.className = "profile-button";

  actions.appendChild(editLink);

  // Remove written review only
  if (hasReview) {
    const removeReview = document.createElement("button");
    removeReview.type = "button";
    removeReview.textContent = "Remove Review";
    removeReview.className = "profile-button";

    removeReview.addEventListener("click", () => {
      deleteProfileEntry(movie.movie_id, true);
    });

    actions.appendChild(removeReview);
  }

  // Delete entire rating
  const deleteRating = document.createElement("button");
  deleteRating.type = "button";
  deleteRating.textContent = "Delete Rating";
  deleteRating.className = "profile-button delete-button";

  deleteRating.addEventListener("click", () => {
    deleteProfileEntry(movie.movie_id, false);
  });

  actions.appendChild(deleteRating);

  content.append(title, scoreLine, review, date, actions);

  card.append(posterArea, content);

  return card;
}

// ==========================================
// 5. LOAD THE USER PROFILE
// ==========================================

async function loadProfile() {
  try {
    const response = await fetch("/api/profile", {
      cache: "no-store",
    });

    if (response.status === 401) {
      profileMessage.hidden = false;
      profileMessage.textContent = "Please log in to view your profile.";

      profileContent.hidden = true;
      return;
    }

    if (!response.ok) {
      throw new Error("Failed to load profile.");
    }

    const data = await response.json();
    const user = data.user;
    const ratings = data.ratings;

    // ACCOUNT INFORMATION
    document.getElementById("profileUsername").textContent = user.username;

    document.getElementById("profileEmail").textContent = user.email;

    document.getElementById("profileJoined").textContent =
      `Joined: ${formatProfileDate(user.created_at)}`;

    // STATISTICS
    const totalRated = ratings.length;

    const totalReviews = ratings.filter(
      (rating) => rating.review && rating.review.trim(),
    ).length;

    const scoreSum = ratings.reduce(
      (total, rating) => total + Number(rating.score),
      0,
    );

    const average = totalRated > 0 ? (scoreSum / totalRated).toFixed(2) : "—";

    document.getElementById("totalRated").textContent = totalRated;

    document.getElementById("totalReviews").textContent = totalReviews;

    document.getElementById("personalAverage").textContent = average;

    // RATING HISTORY
    myRatings.replaceChildren();

    if (ratings.length === 0) {
      myRatings.textContent = "You haven't rated any movies yet.";
    } else {
      ratings.forEach((movie) => {
        myRatings.appendChild(createProfileRatingCard(movie));
      });
    }

    profileMessage.hidden = true;
    profileContent.hidden = false;
  } catch (error) {
    console.error(error);

    profileMessage.hidden = false;
    profileMessage.textContent = "Unable to load your profile.";
  }
}

// ==========================================
// 6. INITIALIZE
// ==========================================

loadProfile();
