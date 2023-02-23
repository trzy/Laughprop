/*
 * www/js/modules/screens/welcome.mjs
 * Bart Trzynadlowski, 2023
 *
 * Welcome UI screen. Displayed when page is loaded. Allows a new game to be started or an existing
 * game to be joined.
 */

import { UIScreen } from "./ui_screen.mjs";
import { generateGameId } from "../game_id.mjs";
import { ClientSnapshotMessage } from "../messages.mjs";

class WelcomeScreen extends UIScreen
{
    _onNewGame;
    _onJoinGame;

    onMessageReceived(msg)
    {
        if (msg instanceof ClientSnapshotMessage)
        {
            // TODO: When the number of clients exceeds 2, send a message to advance the state
            console.log("Current number of clients: " + msg.client_ids.length);
        }
    }

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
        super();
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