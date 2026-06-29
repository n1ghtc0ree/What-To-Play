import logging
import httpx
import asyncio
import requests
import random
from backend.app.config import config as cfg
from backend.app.repositories.games import GamesRepository
from backend.app.schemas.games import GameFetched, UserLibraryGame
from backend.app.exceptions import UnknownVibeException
from backend.app.repositories.utils import calculate_game_score

class GameService:
    def __init__(self, repo: GamesRepository, logger: logging.Logger = logging.getLogger(__name__)):
        self.repo = repo
        self.logger = logger
        
    def get_random_steam_game_no_filters(self) -> dict[str, str | dict | int]:
        """Get a random game from local database (NO STEAM API using) w/o filters"""
        game = self.repo.get_random()
        if game is None:
            self.logger.warning(f"{self.get_random_steam_game_no_filters.__name__}: No games found in the database")
            return {"message": "No games found in the database", "status": 404}
        
        self.logger.info(f"{self.get_random_steam_game_no_filters.__name__}: Returning random game: {game['name']} (AppID: {game['appid']})")
        return {
            "game": game, 
            "header_image": f"https://cdn.akamai.steamstatic.com/steam/apps/{game['appid']}/header.jpg",
            "status": 200
            }
    
    def get_random_game_from_library(self, user_library: list[UserLibraryGame]) -> dict | None:
        game = random.choice(user_library).model_dump()
        enhanced_game = self.get_game_info_by_id(game["appid"])
        
        if isinstance(enhanced_game, GameFetched):
            return enhanced_game.model_dump()
        
        return
    
    def get_game_info_by_id(self, app_id: int) -> GameFetched | list:
        """Fetch details for a given app ID using Steam API"""
        url = f"https://store.steampowered.com/api/appdetails?appids={app_id}"
        r = requests.get(url).json()
        
        self.logger.info(f"Steam API response for {app_id}: {r.get(str(app_id), {})}")

        if not r[str(app_id)]["success"]:
            self.logger.warning(f"Steam API returned success=False for app {app_id}")
            return []

        d = r[str(app_id)]["data"]

        if d.get("type") != "game":
            self.logger.warning(f"App {app_id} is not a game, type: {d.get('type')}")
            return []

        self.logger.info(f"Fetched details for app {app_id}: {d.get('name', 'Unknown')}")

        try:
            pos, neg = self.get_reviews(app_id)
            return GameFetched(
                appid = app_id,
                name =  d.get("name"),
                genres = ",".join([g["description"] for g in d.get("genres", [])]),
                categories = ",".join([c["description"] for c in d.get("categories", [])]),
                is_free = d.get("is_free", False),
                positive = pos,
                negative = neg,
                header_image=f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            )
        except Exception as e:
            self.logger.error(f"Error occured while getting reviews for {app_id}, {d["name"]}: {e}")
            return GameFetched(
                appid = app_id,
                name =  d.get("name"),
                genres = ",".join([g["description"] for g in d.get("genres", [])]),
                categories = ",".join([c["description"] for c in d.get("categories", [])]),
                is_free = d.get("is_free", False),
                positive = 0,
                negative = 0,
                header_image=f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            )
            
    async def get_game_info_by_id_async(self, app_id: int) -> GameFetched | None:
        """Fetch details for a given app ID using Steam API asynchronously"""
        url = f"https://store.steampowered.com/api/appdetails?appids={app_id}"
        async with httpx.AsyncClient() as client:
            r = await client.get(url)
            data = r.json()

        if not data[str(app_id)]["success"]:
            return None

        d = data[str(app_id)]["data"]

        if d.get("type") != "game":
            return None

        self.logger.info(f"Fetched details for app {app_id}: {d.get('name', 'Unknown')}")

        try:
            pos, neg = await self.get_reviews_async(app_id)
            return GameFetched(
                appid = app_id,
                name =  d.get("name"),
                genres = ",".join([g["description"] for g in d.get("genres", [])]),
                categories = ",".join([c["description"] for c in d.get("categories", [])]),
                is_free = d.get("is_free", False),
                positive = pos,
                negative = neg,
                header_image=f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            )
        except Exception as e:
            self.logger.error(f"Error occured while getting reviews for {app_id}, {d["name"]}: {e}")
            return GameFetched(
                appid = app_id,
                name =  d.get("name"),
                genres = ",".join([g["description"] for g in d.get("genres", [])]),
                categories = ",".join([c["description"] for c in d.get("categories", [])]),
                is_free = d.get("is_free", False),
                positive = 0,
                negative = 0,
                header_image=f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            )
            
    def get_reviews(self, appid: int) -> tuple[int, int]:
        """Fetch review summary for a given app ID using Steam store reviews API"""
        url = f"https://store.steampowered.com/appreviews/{appid}?json=1&num_per_page=0"

        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        try:
            r = requests.get(url, headers=headers, timeout=10)

            if r.status_code != 200:
                print("Bad status:", r.status_code)
                return (0, 0)

            data = r.json()
            summary = data.get("query_summary", {})

            self.logger.info(f"Fetched reviews for app {appid}: {summary.get('total_positive', 0)} positive, {summary.get('total_negative', 0)} negative")

            return (
                summary.get("total_positive", 0),
                summary.get("total_negative", 0)
            )

        except Exception as e:
            self.logger.warning(f"Error fetching reviews for app {appid}: {str(e)}")
            return (0, 0)
        
    async def get_reviews_async(self, appid: int) -> tuple[int, int]:
        """Fetch review summary for a given app ID using Steam store reviews API asynchronously"""
        url = f"https://store.steampowered.com/appreviews/{appid}?json=1&num_per_page=0"

        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        async with httpx.AsyncClient() as client:
            r = await client.get(url, headers=headers, timeout=10)

        if r.status_code != 200:
            print("Bad status:", r.status_code)
            return (0, 0)

        data = r.json()
        summary = data.get("query_summary", {})

        self.logger.info(f"Fetched reviews for app {appid}: {summary.get('total_positive', 0)} positive, {summary.get('total_negative', 0)} negative")

        return (
            summary.get("total_positive", 0),
            summary.get("total_negative", 0)
        )
        
    async def get_multiple_game_info(self, app_ids: list[int]) -> list[GameFetched]:
        """Fetch details for multiple app IDs in parallel"""
        tasks = [self.get_game_info_by_id_async(app_id) for app_id in app_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        valid_results = []
        for result in results:
            if isinstance(result, Exception):
                self.logger.error(f"Error fetching game info: {result}")
                continue
            if isinstance(result, GameFetched):
                valid_results.append(result)
        return valid_results
        
    def get_smart_filtered_games(self, user_libary: list[UserLibraryGame] | list, is_user_library: bool = False, vibe: str | None = None, player_counts: str | None = None, time_pref: str | None = None, seen_games: list[str] = []):
        if cfg.VIBE_CHECKING and vibe not in cfg.VIBES_MAP:
            self.logger.error(f"Unknown vibe: {vibe}")
            raise UnknownVibeException

        # When using user library, reset seen_games to avoid overfiltering
        if is_user_library:
            seen_appids = set()
            self.logger.info("Reset seen_games for user library filtering")
        else:
            # Filter empty strings from seen_games and convert to set for O(1) lookup
            seen_appids = set(str(appid) for appid in seen_games if appid and str(appid).strip())

        if is_user_library and user_libary:
            games = []
            for game in user_libary:
                dumped_game = game.model_dump()

                score = calculate_game_score(dumped_game, vibe, player_counts, time_pref)
                dumped_game["score"] = score
                games.append(dumped_game)

            games.sort(key=lambda x: x["score"], reverse=True)

            valid_games = [g for g in games if g["score"] > -9999]

            if len(valid_games) == 0:
                self.logger.warning("No games passed hard filtering, returning top games anyway")
                valid_games = games[:10]

            # Use actual library size instead of fixed TOP_K
            top_games = valid_games

            # Filter out seen games
            available_games = [g for g in top_games if str(g['appid']) not in seen_appids]
            
            # If not enough games after filtering, use all valid games (not just top_games)
            if len(available_games) < 3:
                self.logger.warning(f"Not enough games after filtering seen_games, using all valid games")
                available_games = valid_games

            self.logger.info(f"Available games count: {len(available_games)}")
            self.logger.info(f"Seen games: {seen_appids}")

            items = random.sample(available_games, min(3, len(available_games)))
            self.logger.info(f"Selected items for processing: {[item.get('appid') for item in items]}")

            result = []
            for item in items:
                if not isinstance(item, list):
                    appid = item['appid']
                    self.logger.info(f"Processing game for appid: {appid}")
                    
                    # First try to get from Steam API
                    game_info = self.get_game_info_by_id(appid)
                    
                    # If Steam API fails, use existing data from user library
                    if game_info and not isinstance(game_info, list) and game_info.name and game_info.name != "Unknown":
                        result.append(game_info)
                        self.logger.info(f"Used Steam API data for {appid}")
                    else:
                        # Use existing data from user library
                        self.logger.warning(f"Steam API failed for {appid}, using existing library data")
                        library_game = next((g for g in user_libary if g.appid == appid), None)
                        if library_game and library_game.name and library_game.name != "Unknown":
                            result.append(GameFetched(
                                appid=library_game.appid,
                                name=library_game.name,
                                genres=library_game.genres or "",
                                categories=library_game.categories or "",
                                is_free=False,
                                positive=library_game.positive or 0,
                                negative=library_game.negative or 0,
                                header_image=f"https://cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg"
                            ))
                            self.logger.info(f"Used library data for {appid}: {library_game.name}")
                        else:
                            self.logger.error(f"Game {appid} not found in library either or has invalid data")

            return result


        self.logger.info("Smart filtering through local db")
        return self.repo.smart_filter_games(vibe, player_counts, time_pref)