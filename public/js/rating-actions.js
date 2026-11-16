const ratingActionsMovieId = new URLSearchParams(window.location.search).get("id");
const ratingActionsForm = document.getElementById("ratingForm");
const deleteActions = document.createElement("div");
deleteActions.className = "rating-delete-actions";
const removeReviewButton = document.createElement("button");
removeReviewButton.type = "button";
removeReviewButton.textContent = "Remove Written Review";
removeReviewButton.className = "remove-review-button";
removeReviewButton.hidden = true;
const deleteRatingButton = document.createElement("button");
deleteRatingButton.type = "button";
deleteRatingButton.textContent = "Delete Rating & Review";
deleteRatingButton.className = "delete-rating-button";
deleteRatingButton.hidden = true;
const deleteMessage = document.createElement("p");
deleteMessage.setAttribute("role", "status");
deleteActions.append(removeReviewButton, deleteRatingButton);
ratingActionsForm.append(deleteActions, deleteMessage);

async function refreshRatingActions() {
    try {
        const response = await fetch(`/api/movies/${ratingActionsMovieId}/my-rating`, { cache: "no-store" });
        if (!response.ok) {
            removeReviewButton.hidden = true;
            deleteRatingButton.hidden = true;
            return;
        }
        const data = await response.json();
        const rating = data.rating;
        deleteRatingButton.hidden = !rating;
        removeReviewButton.hidden = !(rating && rating.review && rating.review.trim());
    } catch (error) {
        console.error(error);
        removeReviewButton.hidden = true;
        deleteRatingButton.hidden = true;
    }
}
async function performRatingDeletion(reviewOnly) {
    const confirmation = reviewOnly
        ? "Remove only your written review? Your numerical rating will stay."
        : "Permanently delete your rating and review?";
    if (!window.confirm(confirmation)) return;
    const endpoint = reviewOnly
        ? `/api/movies/${ratingActionsMovieId}/review`
        : `/api/movies/${ratingActionsMovieId}/ratings`;
    deleteRatingButton.disabled = true;
    removeReviewButton.disabled = true;
    deleteMessage.textContent = "Processing...";
    try {
        const response = await fetch(endpoint, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Deletion failed.");
        await Promise.all([loadRatings(), loadMyRating()]);
        await refreshRatingActions();
        deleteMessage.textContent = data.message;
    } catch (error) {
        console.error(error);
        deleteMessage.textContent = error.message;
    } finally {
        deleteRatingButton.disabled = false;
        removeReviewButton.disabled = false;
    }
}
removeReviewButton.addEventListener("click", () => performRatingDeletion(true));
deleteRatingButton.addEventListener("click", () => performRatingDeletion(false));
if (ratingActionsMovieId && /^[1-9]\d*$/.test(ratingActionsMovieId)) {
    refreshRatingActions();
}
