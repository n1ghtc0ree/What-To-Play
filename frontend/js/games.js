import { moodToVibe, translations, timeToDuration } from "./config.js";
import { showErrorPopup, showSuccessPopup, resetPopupVisible, showLoadingOverlay, hideLoadingOverlay } from "./ui.js";

export function displayGames(games, duration = null, currentLang = "en") {
  const seenGames = new Set(
    localStorage.getItem("seenGames")?.split(",") || [],
  );
  const $gameResult = $("#gameResult").empty().show();

  const timeGenres = {
    short: ["casual", "arcade", "indie", "puzzle", "racing", "sports"],
    medium: ["action", "adventure", "simulation", "fps", "competitive", "multiplayer"],
    long: ["rpg", "strategy", "simulation", "fps", "competitive", "multiplayer"],
  };

  games.forEach((game, index) => {
    const Image = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
    const genres = game.genres || "Unknown Genre";
    const genresList = typeof genres === "string" ? genres.split(",") : genres;
    
    // Skip games with missing essential data
    if (!game.name || game.name === "Unknown Game" || !game.appid) {
      console.warn(`Skipping invalid game: ${JSON.stringify(game)}`);
      return;
    }

    let filteredGenres = genresList;
    if (duration && timeGenres[duration]) {
      const relevantGenres = timeGenres[duration];
      filteredGenres = genresList.filter(genre =>
        relevantGenres.some(rg => genre.toLowerCase().includes(rg))
      );
      if (filteredGenres.length === 0) {
        filteredGenres = genresList;
      }
    }

    const limitedGenres = filteredGenres.slice(0, 3).join(", ");
    const categories = game.categories || "";
    const isMultiplayer = categories.toLowerCase().includes("multi-player");

    const $card = $(`
      <div class="game-card" style="opacity: 0; transform: translateY(30px); filter: blur(10px);" data-appid="${game.appid}" data-game-name="${game.name || "Unknown Game"}">
        <div class="glow"></div>
        <div class="game-banner">
          <img src="${Image}" alt="Game Banner" onerror="this.onerror=null; this.src='img/ded.png'">
        </div>
        <div class="game-info">
          <h3 class="game-title">${game.name || "Unknown Game"}</h3>
          <p class="game-genre">${limitedGenres}</p>
          <div class="game-meta">
            <span class="game-time">${game.is_free ? "Free to Play" : "Paid"}</span>
            <span class="game-difficulty">${game.positive || 0 > game.negative || 0 ? "Positive Reviews" : "Mixed Reviews"}</span>
            ${isMultiplayer ? '<span class="game-friends">With Friends</span>' : ""}
          </div>
        </div>
      </div>
    `);

    $gameResult.append($card);
    seenGames.add(game.appid);

    setTimeout(
      () => {
        $card.css({
          opacity: 1,
          transform: "translateY(0)",
          filter: "blur(0px)",
          transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        });
      },
      50 + index * 150,
    );
  });

  const gameCount = games.length;
  if (gameCount === 1) {
    $gameResult.css({
      "max-width": "350px",
      "place-items": "center",
    });
  } else if (gameCount === 2) {
    $gameResult.css({
      "max-width": "720px",
      "place-items": "center",
    });
  } else {
    $gameResult.css({
      "max-width": "",
      "place-items": "",
    });
  }

  localStorage.setItem("seenGames", Array.from(seenGames).join(","));

  const maxDelay = 50 + games.length * 150;
  setTimeout(() => {
    hideLoadingOverlay(currentLang);
  }, maxDelay + 500);

  $("#checkRequirements")
    .prop("disabled", false)
    .css({ opacity: 1, cursor: "pointer" });
}

export function findGames(userState, currentLang) {
  const vibe = userState.mood ? moodToVibe[userState.mood] : null;

  const duration = userState.time ? timeToDuration[userState.time] : null;
  const players = userState.single !== null && userState.single !== undefined
    ? (userState.single ? "single" : "multi")
    : null;

  const vibeToSend = vibe || (duration || players ? "chill" : null);

  if (!vibe || !duration || !players) {
    console.log("Validation failed:", { vibe, duration, players, userState });
    resetPopupVisible();
    showErrorPopup(
      translations[currentLang]["select-all-filters"],
      currentLang,
    );
    return;
  }

  showLoadingOverlay();

  const steamLibrary = localStorage.getItem("steamLibrary");
  const userLibrary = steamLibrary ? JSON.parse(steamLibrary) : [];
  const isUserLibrary = userLibrary.length > 0;

  console.log("FindGames - Steam library check:", {
    steamLibraryExists: !!steamLibrary,
    userLibraryCount: userLibrary.length,
    isUserLibrary: isUserLibrary
  });

  let seenGames = (localStorage.getItem("seenGames")?.split(",") || []).filter(id => id && id.trim());

  // Keep only last 50 seen games to prevent overfiltering
  if (seenGames.length > 50) {
    seenGames = seenGames.slice(-50);
    localStorage.setItem("seenGames", seenGames.join(","));
  }

  const payload = {
    vibe: vibeToSend,
    time_pref: duration,
    player_counts: players,
    is_user_library: isUserLibrary,
    user_library: userLibrary,
    seen_games: seenGames
  };

  fetch("https://what-to-play.onrender.com/games/filters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) {
        hideLoadingOverlay(currentLang);
        resetPopupVisible();
        showErrorPopup(
          data.message || "Failed to fetch games",
          currentLang,
        );
        return;
      }

      const games = data.games || [];

      if (games.length === 0) {
        hideLoadingOverlay(currentLang);
        resetPopupVisible();
        showErrorPopup("No games found", currentLang);
        return;
      }

      const gamesToShow = games.slice(0, 3);

      displayGames(gamesToShow, duration, currentLang);

      // Smooth scroll to game results after a short delay
      setTimeout(() => {
        const gameResult = document.getElementById("gameResult");
        if (gameResult) {
          gameResult.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      }, 300);
    })
    .catch((error) => {
      console.error("Error fetching games:", error);
      hideLoadingOverlay(currentLang);
      resetPopupVisible();
      showErrorPopup(translations[currentLang]["server-error"], currentLang);
    });
}

export function dontCare(currentLang) {
  showLoadingOverlay();

  const steamLibrary = localStorage.getItem("steamLibrary");
  const userLibrary = steamLibrary ? JSON.parse(steamLibrary) : [];
  const hasLibrary = userLibrary.length > 0;

  console.log("DontCare - Steam library check:", {
    hasLibrary: hasLibrary,
    libraryCount: userLibrary.length
  });

  if (hasLibrary) {
    fetch("https://what-to-play.onrender.com/random/library", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_library: userLibrary
      })
    })
      .then((r) => r.json())
      .then((data) => {
        const game = data || {};
        const Image = game.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
        const genres = game.genres || "Unknown Genre";
        // Limit genres to 3 for cleaner display
        const genresList = typeof genres === "string" ? genres.split(",") : genres;
        const limitedGenres = genresList.slice(0, 3).join(", ");
        const categories = game.categories || "";
        const isMultiplayer = categories.toLowerCase().includes("multi-player");
        const gameCard = `
          <div class="game-card" style="opacity: 0; transform: translateY(30px); filter: blur(10px);" data-appid="${game.appid}" data-game-name="${game.name || "Unknown Game"}">
            <div class="glow"></div>
            <div class="game-banner">
              <img src="${Image}" alt="Game Banner" onerror="this.onerror=null; this.src='img/ded.png'">
            </div>
            <div class="game-info">
              <h3 class="game-title">${game.name || "Unknown Game"}</h3>
              <p class="game-genre">${limitedGenres}</p>
              <div class="game-meta">
                <span class="game-time">${game.is_free ? "Free to Play" : "Paid"}</span>
                <span class="game-difficulty">${(game.positive || 0) > (game.negative || 0) ? "Positive Reviews" : "Mixed Reviews"}</span>
                ${isMultiplayer ? '<span class="game-friends">With Friends</span>' : ""}
              </div>
            </div>
          </div>
        `;

        $("#gameResult").html(gameCard);

        setTimeout(() => {
          $(".game-card").css({
            opacity: 1,
            transform: "translateY(0)",
            filter: "blur(0)"
          });
        }, 50);

        setTimeout(() => {
          hideLoadingOverlay(currentLang);
        }, 650);
      })
      .catch((error) => {
        console.error("Error fetching random game from library:", error);
        hideLoadingOverlay(currentLang);
        resetPopupVisible();
        showErrorPopup(translations[currentLang]["server-error"], currentLang);
      });
  } else {
    fetch("https://what-to-play.onrender.com/random")
      .then((r) => r.json())
      .then((data) => {
        const game = data.game || {};
        const Image = data.header_image || "img/testimg.png";
        const genres = game.genres || "Unknown Genre";
        const genresList = typeof genres === "string" ? genres.split(",") : genres;
        const limitedGenres = genresList.slice(0, 3).join(", ");
        const categories = game.categories || "";
        const isMultiplayer = categories.toLowerCase().includes("multi-player");
        const gameCard = `
          <div class="game-card" style="opacity: 0; transform: translateY(30px); filter: blur(10px);" data-appid="${game.appid}" data-game-name="${game.name || "Unknown Game"}">
            <div class="glow"></div>
            <div class="game-banner">
              <img src="${Image}" alt="Game Banner" onerror="this.onerror=null; this.src='img/ded.png'">
            </div>
            <div class="game-info">
              <h3 class="game-title">${game.name || "Unknown Game"}</h3>
              <p class="game-genre">${limitedGenres}</p>
              <div class="game-meta">
                <span class="game-time">${game.is_free ? "Free to Play" : "Paid"}</span>
              <span class="game-difficulty">${game.positive || 0 > game.negative || 0 ? "Positive Reviews" : "Mixed Reviews"}</span>
              ${isMultiplayer ? '<span class="game-friends">With Friends</span>' : ""}
            </div>
          </div>
        `;
        const $card = $(gameCard);
        $("#gameResult").html($card).show();

        setTimeout(() => {
          $card.css({
            opacity: 1,
            transform: "translateY(0)",
            filter: "blur(0px)",
            transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          });
        }, 50);

        setTimeout(() => {
          hideLoadingOverlay(currentLang);
        }, 650);
      })
      .catch((error) => {
        hideLoadingOverlay(currentLang);
        resetPopupVisible();
        showErrorPopup(translations[currentLang]["server-error"], currentLang);
      });
  }
}
