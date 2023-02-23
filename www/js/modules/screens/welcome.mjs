/*
 * www/js/modules/screens/welcome.mjs
 * Bart Trzynadlowski, 2023
 *
 * Welcome UI screen. Displayed when page is loaded. Allows a new game to be started or an existing
 * game to be joined.
 */

import { generateGameId } from "../game_id.mjs";

class WelcomeScreen
{
    _onNewGame;
    _onJoinGame;

    onNewGameButtonClicked()
    {
        var gameId = generateGameId();
        this._onNewGame(gameId);
        $("#WelcomeScreen #GameID").val(gameId);
        $("#WelcomeScreen #Buttons").hide();
        $("#WelcomeScreen #StartingNewGameMessage").show();
    }

    constructor(onNewGame, onJoinGame)
    {
        var self = this;
        this._onNewGame = onNewGame;
        this._onJoinGame = onJoinGame;
        $("#WelcomeScreen #NewGameButton").off("click").click(function() { self.onNewGameButtonClicked() });
        $("#WelcomeScreen #Buttons").show();
        $("#WelcomeScreen #StartingNewGameMessage").hide();
        $("#WelcomeScreen").show();
    }
}

export { WelcomeScreen };