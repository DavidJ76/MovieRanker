"use strict";

// Homepage: five trending TMDB films + MovieRanker's own top ten ratings.
// No API token or database credentials are exposed in browser JavaScript.
(() => {
  const trendingList = document.getElementById("trendingList");
  const trendingStatus = document.getElementById("trendingStatus");
  const rankingList = document.getElementById("mrTop10");
  const rankingStatus = document.getElementById("rankingStatus");
  const searchForm = document.getElementById("movieSearchForm");
  const searchInput = document.getElementById("movieSearchInput");
  const searchClear = document.getElementById("movieSearchClear");
  const searchSection = document.getElementById("search");
  const searchResults = document.getElementById("movieSearchResults");
  const searchStatus = document.getElementById("movieSearchStatus");
  const searchSubtitle = document.getElementById("searchResultsSubtitle");
  if (!trendingList || !trendingStatus || !rankingList || !rankingStatus)
    return;

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.error || `Request failed (${response.status}).`);
    if (!body) throw new Error("The server returned an invalid response.");
    return body;
  }

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  function setPoster(holder, posterUrl, title) {
    const placeholder = node(
      "div",
      "mr-poster-placeholder",
      "No poster available",
    );
    holder.appendChild(placeholder);
    if (typeof posterUrl !== "string" || !/^https?:\/\//i.test(posterUrl))
      return;
    const image = document.createElement("img");
    image.src = posterUrl;
    image.alt = `${title} poster`;
    image.loading = "lazy";
    image.decoding = "async";
    image.onload = () => {
      placeholder.hidden = true;
    };
    image.onerror = () => {
      image.remove();
      placeholder.hidden = false;
    };
    holder.appendChild(image);
  }

  // A TMDB card is a normal link. Opening details never writes to MySQL,
  // so visitors can browse even when they are logged out.
  function trendingCard(movie, index) {
    const card = node("a", "mr-trending-card");
    card.href = `/movie.html?tmdb_id=${encodeURIComponent(movie.tmdb_id)}`;
    card.setAttribute("aria-label", `View ${movie.title || "movie"} details`);
    const poster = node("div", "mr-trending-poster");
    setPoster(poster, movie.poster_path, movie.title || "Movie");
    if (Number.isInteger(index)) {
      poster.appendChild(
        node("span", "mr-trend-position", String(index + 1).padStart(2, "0")),
      );
    }

    const details = node("div", "mr-trend-details");
    const title = node("h3", "mr-trend-title", movie.title || "Untitled movie");
    const year = node(
      "p",
      "mr-trend-year",
      movie.release_year || "Release date unknown",
    );
    const view = node("span", "mr-rate-button", "View movie");
    details.append(title, year, view);
    card.append(poster, details);
    return card;
  }

  function rankingRow(movie, index) {
    const row = node("a", "mr-ranking-row");
    row.href = `/movie.html?id=${encodeURIComponent(movie.movie_id)}`;
    row.setAttribute(
      "aria-label",
      `Rank ${index + 1}: ${movie.title}, ${Number(movie.average_rating).toFixed(2)} out of 10`,
    );

    const rank = node(
      "span",
      "mr-ranking-number",
      String(index + 1).padStart(2, "0"),
    );
    const poster = node("div", "mr-ranking-poster");
    setPoster(poster, movie.poster_path, movie.title || "Movie");

    const info = node("div", "mr-ranking-info");
    info.appendChild(
      node("strong", "mr-ranking-title", movie.title || "Untitled movie"),
    );
    info.appendChild(
      node("small", "mr-ranking-year", movie.release_year || "Unknown year"),
    );

    const rating = node("div", "mr-ranking-score");
    const score = node(
      "strong",
      "mr-score-value",
      Number(movie.average_rating).toFixed(2),
    );
    const outOf = node("span", "mr-score-out-of", " / 10");
    const votes = Number(movie.rating_count) || 0;
    const count = node(
      "small",
      "mr-score-count",
      `${votes} ${votes === 1 ? "rating" : "ratings"}`,
    );
    const stars = node("span", "mr-score-star", "★");
    rating.append(stars, score, outOf, count);
    row.append(
      rank,
      poster,
      info,
      rating,
      node("span", "mr-ranking-arrow", "›"),
    );
    return row;
  }

  // Search TMDB, not the local movies table. The endpoint already exists in routes/tmdb.js.
  let debounceTimer = null;
  let activeSearch = null;
  let searchVersion = 0;

  function resetSearch() {
    clearTimeout(debounceTimer);
    searchVersion += 1;
    if (activeSearch) activeSearch.abort();
    activeSearch = null;
    searchResults.replaceChildren();
    searchStatus.textContent = "";
    searchSection.hidden = true;
    searchClear.hidden = true;
  }

  async function runSearch({ scroll = false } = {}) {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      resetSearch();
      if (query.length && scroll) {
        searchSection.hidden = false;
        searchStatus.textContent = "Enter at least 2 characters to search.";
      }
      return;
    }
    searchClear.hidden = false;
    searchSection.hidden = false;
    searchResults.replaceChildren();
    searchStatus.textContent = `Searching for “${query}”…`;
    searchSubtitle.textContent = `TMDB results for “${query}”`;
    if (activeSearch) activeSearch.abort();
    const controller = new AbortController();
    activeSearch = controller;
    const version = ++searchVersion;
    if (scroll)
      searchSection.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const data = await fetchJson(
        `/api/tmdb/search?query=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
        },
      );
      if (version !== searchVersion) return;
      if (!Array.isArray(data.results))
        throw new Error("Unexpected TMDB search response.");
      const movies = data.results
        .filter((movie) => movie && movie.tmdb_id)
        .slice(0, 18);
      movies.forEach((movie) =>
        searchResults.appendChild(trendingCard(movie, null)),
      );
      searchStatus.textContent = movies.length
        ? `${movies.length} ${movies.length === 1 ? "movie" : "movies"} found.`
        : `No movies found for “${query}”. Try a different title.`;
    } catch (error) {
      if (error.name === "AbortError" || version !== searchVersion) return;
      console.error("TMDB movie search failed:", error);
      searchStatus.textContent = `Unable to search movies: ${error.message}`;
    } finally {
      if (version === searchVersion) activeSearch = null;
    }
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch({ scroll: true });
  });
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    if (searchInput.value.trim().length < 2) {
      resetSearch();
      return;
    }
    // Debounce prevents sending a request for every keystroke.
    debounceTimer = setTimeout(() => runSearch(), 400);
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    resetSearch();
    searchInput.focus();
  });

  async function loadTrending() {
    trendingStatus.textContent = "Loading trending movies…";
    try {
      const data = await fetchJson("/api/tmdb/trending");
      if (!Array.isArray(data.results))
        throw new Error("Unexpected TMDB response.");
      trendingList.replaceChildren();
      const movies = data.results.slice(0, 5);
      movies.forEach((movie, index) =>
        trendingList.appendChild(trendingCard(movie, index)),
      );
      trendingStatus.textContent = movies.length
        ? ""
        : "No trending movies are available right now.";
    } catch (error) {
      console.error("Trending movies failed:", error);
      trendingStatus.textContent = `Unable to load TMDB trending movies: ${error.message}`;
    }
  }

  async function loadTop10() {
    rankingStatus.textContent = "Loading community rankings…";
    try {
      const data = await fetchJson("/api/movies?sort=top");
      if (!Array.isArray(data))
        throw new Error("Unexpected MovieRanker response.");
      const movies = data
        .filter(
          (movie) =>
            movie.average_rating !== null && Number(movie.rating_count) > 0,
        )
        .slice(0, 10);
      rankingList.replaceChildren();
      movies.forEach((movie, index) =>
        rankingList.appendChild(rankingRow(movie, index)),
      );
      rankingStatus.textContent = movies.length
        ? ""
        : "No community ratings yet. Rate a movie to start the Top 10.";
    } catch (error) {
      console.error("Community rankings failed:", error);
      rankingStatus.textContent = `Unable to load rankings: ${error.message}`;
    }
  }

  loadTrending();
  loadTop10();
})();
