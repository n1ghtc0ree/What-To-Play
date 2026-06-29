import {
  showErrorPopup,
  showSuccessPopup,
  resetPopupVisible,
  getPopupVisible,
  showConfirmPopup,
  showLoadingOverlayWithText,
  hideLoadingOverlay,
} from "./ui.js";
import { translations } from "./config.js";

export let steamInputMode = "nickname";

export function setupSteamInputListener(currentLang) {
  $("#steamNickname").off("input").on("input", function () {
    const inputValue = $(this).val().trim();
    const $checkmark = $("#steamCheckmark");

    if (inputValue) {
      $checkmark.addClass("visible");
    } else {
      $checkmark.removeClass("visible");
    }
  });

  $("#steamCheckmark").off("click").on("click", function () {
    const inputValue = $("#steamNickname").val().trim();
    if (inputValue) {
      fetchSteamLibrary(currentLang);
    }
  });
}

export function toggleSteamMode() {
  steamInputMode = steamInputMode === "id" ? "nickname" : "id";
  $("#toggleSteamMode").text(steamInputMode === "id" ? "SteamID" : "Nickname");
  $("#steamNickname").attr(
    "placeholder",
    steamInputMode === "id" ? "Enter Steam ID..." : "Enter Steam nickname...",
  );
  console.log("Steam input mode changed to:", steamInputMode);
}

export function fetchSteamLibrary(currentLang) {
  const inputValue = $("#steamNickname").val().trim();

  if (!inputValue) {
    showErrorPopup(
      steamInputMode === "id"
        ? "Please enter Steam ID"
        : "Please enter Steam nickname",
      currentLang,
    );
    return;
  }

  const looksLikeID = /^\d{17}$/.test(inputValue);
  const looksLikeNickname = /^[a-zA-Z0-9_-]+$/.test(inputValue) && !looksLikeID;

  let actualInputType = steamInputMode;
  if (looksLikeID) actualInputType = "id";
  else if (looksLikeNickname) actualInputType = "nickname";

  if (steamInputMode !== actualInputType) {
    const modeName = actualInputType === "id" ? "ID" : "nickname";
    resetPopupVisible();
    showSuccessPopup(
      `Detected ${modeName} mode. Proceeding with ${modeName}...`,
    );
  }

  const $btn = $("#fetchSteamLibrary");
  const originalText = $btn.html();
  $btn
    .prop("disabled", true)
    .html(
      `<span class="icon-wrapper"><iconify-icon icon="fa-solid:spinner" class="fa-spin"></iconify-icon></span>${translations[currentLang].loading}`,
    );

  showLoadingOverlayWithText(translations[currentLang]["fetching-library"]);

  const url =
    actualInputType === "id"
      ? `https://what-to-play.onrender.com/owned-games/enriched/id/${inputValue}`
      : `https://what-to-play.onrender.com/owned-games/enriched/vanity/${inputValue}`;

  fetch(url)
    .then((r) => r.json())
    .then((data) => {
      $btn.prop("disabled", false).html(originalText);
      hideLoadingOverlay(currentLang);

      if (data.error || data.status === 404) {
        showErrorPopup(
          data.message || data.error || "Failed to fetch library",
          currentLang,
        );
        return;
      }

      const games = data.owned_games || [];
      console.log(`Fetched ${games.length} games from Steam library`);

      const appids = games.map((game) => game.appid);
      localStorage.setItem("steamLibraryAppids", JSON.stringify(appids));
      localStorage.setItem("steamLibrary", JSON.stringify(games));

      resetPopupVisible();
      showSuccessPopup(
        `Successfully fetched ${games.length} games from library`,
      );
    })
    .catch((error) => {
      console.error("Error fetching Steam library:", error);
      $btn.prop("disabled", false).html(originalText);
      hideLoadingOverlay(currentLang);
      showErrorPopup(translations[currentLang]["server-error"], currentLang);
    });
}

export function clearNickname(currentLang) {
  const inputValue = $("#steamNickname").val().trim();
  const hasLibrary = localStorage.getItem("steamLibrary");

  if (!inputValue && !hasLibrary) {
    return;
  }

  let confirmMessage;
  if (inputValue && hasLibrary) {
    confirmMessage = translations[currentLang]["confirm-clear-nickname-both"];
  } else if (!inputValue && hasLibrary) {
    confirmMessage = translations[currentLang]["confirm-clear-nickname-with-library"];
  } else if (inputValue && !hasLibrary) {
    confirmMessage = translations[currentLang]["confirm-clear-nickname-with-nickname"];
  } else {
    confirmMessage = translations[currentLang]["confirm-clear-nickname"];
  }

  showConfirmPopup(
    confirmMessage,
    currentLang,
    () => {
      $("#steamNickname").val("");
      $("#steamCheckmark").removeClass("visible");
      localStorage.removeItem("steamLibrary");
      localStorage.removeItem("steamLibraryAppids");
      console.log("Cleared Steam library from localStorage");
    }
  );
}
