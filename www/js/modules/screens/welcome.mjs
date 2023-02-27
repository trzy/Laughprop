/*
 * www/js/modules/screens/welcome.mjs
 * Bart Trzynadlowski, 2023
 *
 * Welcome UI screen. Displayed when page is loaded. Allows a new game to be started or an existing
 * game to be joined.
 */

import { UIScreen } from "./ui_screen.mjs";
import { SelectGameScreen } from "./select_game.mjs";
import { generateGameId } from "../utils.mjs";
import { UnknownGameMessage, ClientSnapshotMessage, AuthoritativeStateMessage } from "../messages.mjs";

class WelcomeScreen extends UIScreen
{
    // Callbacks
    _onNewGameSelected;
    _onJoinGameSelected;
    _sendMessageFn;

    // State
    _clientIds;

    // UI elements
    _gameIdField;
    _buttonsContainer;
    _newGameButton;
    _joinGameButton;
    _startingNewGameMessage;
    _joiningGameMessage;
    _failedToJoinGameMessage;

    get className()
    {
        return WelcomeScreen.name;
    }

    onMessageReceived(msg)
    {
        if (msg instanceof ClientSnapshotMessage)
        {
            this._clientIds = msg.client_ids;
            console.log("Current number of clients: " + this._clientIds.length);
            if (this._clientIds.length >= 2)
            {
                // Whether joining or starting the game, once we have at least two clients, move on
                this._sendMessageFn(new AuthoritativeStateMessage(SelectGameScreen.name, {}));
            }
        }
        else if (msg instanceof UnknownGameMessage)
        {
            if (this._isJoiningGame())
            {
                this._joiningGameMessage.hide();
                this._failedToJoinGameMessage.show();
                this._buttonsContainer.show();
                this._gameIdField.val("");          // clear game ID
                this._onGameIdTextFieldChanged();   // force update to text field
            }
            else
            {
                console.log(`Error: Received UnknownGameMessage but not in joining state (isStartingNewGame=${this._isStartingNewGame()}):`, msg);
            }
        }
    }

    _onNewGameButtonClicked()
    {
        var gameId = generateGameId();
        this._gameIdField.val(gameId);
        this._buttonsContainer.hide();
        this._startingNewGameMessage.show();
        this._failedToJoinGameMessage.hide();
        this._onNewGameSelected(gameId);
    }

    _onJoinGameButtonClicked()
    {
        this._buttonsContainer.hide();
        this._joiningGameMessage.show();
        this._failedToJoinGameMessage.hide();
        this._onJoinGameSelected(this._gameIdField.val());
    }

    _onGameIdTextFieldChanged()
    {
        this._gameIdField.val(this._gameIdField.val().toUpperCase());
        if (this._gameIdField.val().length == 4)
        {
            // Join button becomes selectable when we have 4 characters
            let self = this;
            this._joinGameButton.removeClass("disabled");
            this._joinGameButton.off("click").click(function() { self._onJoinGameButtonClicked() });
        }
        else
        {
            this._joinGameButton.addClass("disabled");
            this._joinGameButton.off("click");
        }
    }

    _isStartingNewGame()
    {
        return this._startingNewGameMessage.is(":visible");
    }

    _isJoiningGame()
    {
        return this._joiningGameMessage.is(":visible");
    }

    constructor(onNewGameSelected, onJoinGameSelected, sendMessageFn)
    {
        super();
        let self = this;

        this._clientIds = [];

        this._onNewGameSelected = onNewGameSelected;
        this._onJoinGameSelected = onJoinGameSelected;
        this._sendMessageFn = sendMessageFn;

        this._gameIdField = $("#WelcomeScreen #GameID");
        this._buttonsContainer = $("#WelcomeScreen #Buttons");
        this._newGameButton = $("#WelcomeScreen #NewGameButton");
        this._joinGameButton = $("#WelcomeScreen #JoinGameButton")
        this._startingNewGameMessage = $("#WelcomeScreen #StartingNewGameMessage");
        this._joiningGameMessage = $("#WelcomeScreen #JoiningGameMessage");
        this._failedToJoinGameMessage = $("#WelcomeScreen #FailedToJoinGameMessage");

        this._gameIdField.val("");
        this._gameIdField.off("input").on("input", function(e) { self._onGameIdTextFieldChanged(); });

        this._newGameButton.off("click").click(function() { self._onNewGameButtonClicked() });

        this._joinGameButton.addClass("disabled");

        this._buttonsContainer.show();

        this._startingNewGameMessage.hide();
        this._joiningGameMessage.hide();
        this._failedToJoinGameMessage.hide();

        $("#WelcomeScreen").show();
    }
}

export { WelcomeScreen };