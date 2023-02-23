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

    _gameIdField;
    _buttonsContainer;
    _newGameButton;
    _joinGameButton;
    _startingNewGameMessage;


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
        this._gameIdField.val(gameId);
        this._buttonsContainer.hide();
        this._startingNewGameMessage.show();
    }

    onJoinGameButtonClicked()
    {
        console.log("Join game: " + this._gameIdField.val());
    }

    onGameIdTextFieldChanged(e)
    {
        e.target.value = e.target.value.toUpperCase();
        if (e.target.value.length == 4)
        {
            // Join button becomes selectable when we have 4 characters
            let self = this;
            this._joinGameButton.removeClass("disabled");
            this._joinGameButton.off("click").click(function() { self.onJoinGameButtonClicked() });
        }
        else
        {
            this._joinGameButton.addClass("disabled");
            this._joinGameButton.off("click");
        }
    }

    constructor(onNewGame, onJoinGame)
    {
        super();
        let self = this;

        this._onNewGame = onNewGame;
        this._onJoinGame = onJoinGame;
        this._gameIdField = $("#WelcomeScreen #GameID");
        this._buttonsContainer = $("#WelcomeScreen #Buttons");
        this._newGameButton = $("#WelcomeScreen #NewGameButton");
        this._joinGameButton = $("#WelcomeScreen #JoinGameButton")
        this._startingNewGameMessage = $("#WelcomeScreen #StartingNewGameMessage");

        this._gameIdField.val("");
        this._gameIdField.off("input").on("input", function(e) { self.onGameIdTextFieldChanged(e); });

        this._newGameButton.off("click").click(function() { self.onNewGameButtonClicked() });

        this._joinGameButton.addClass("disabled");

        this._buttonsContainer.show();

        this._startingNewGameMessage.hide();

        $("#WelcomeScreen").show();
    }
}

export { WelcomeScreen };