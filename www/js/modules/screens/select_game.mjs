/*
 * www/js/modules/screens/select_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Select game UI screen.
 */

import { UIScreen } from "./ui_screen.mjs";
import { ClientSnapshotMessage, AuthoritativeStateMessage, PeerStateMessage } from "../messages.mjs";

class SelectGamePeerState
{
    selection;

    constructor(selection)
    {
        this.selection = selection;
    }
}

class SelectGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // State
    _ourClientId;
    _selectionByClientId;
    _clientIds;

    // UI elements
    _gameButtons;

    get className()
    {
        return SelectGameScreen.name;
    }

    onMessageReceived(msg)
    {
        if (msg instanceof ClientSnapshotMessage)
        {
            // Client snapshot indicates someone joined or left. We must sent a state update in return.
            this._clientIds = msg.client_ids;
            console.log("Current number of clients: " + this._clientIds.length);
            console.log("Clients:", this._clientIds);
            this._sendMessageFn(new AuthoritativeStateMessage(SelectGameScreen.name, {}));
            // TODO: authoritative state must integrate peer states because peer state update alone may be
            //       missed if received before the authoritative state update from actual authority
            this._sendPeerState();  // peer state after authoritative state
        }
        else if (msg instanceof PeerStateMessage)
        {
            // Someone sent us their selection
            this._selectionByClientId[msg.from_client_id] = msg.state.selection;
            console.log("Current game selections:", this._selectionByClientId);

            // Check if we have enough votes to proceed
            this._tryStartGame();
        }
    }

    _tryStartGame()
    {
         // Once all clients have transmitted their selections, pick a winner
         if (Object.keys(this._selectionByClientId).sort().toString() == this._clientIds.sort().toString())
         {
             let winningGame = this._determineWinningSelection();
             console.log("Winning selection: " + winningGame);
         }
         else
         {
            console.log("Insufficient votes", Object.keys(this._selectionByClientId), this._clientIds);
         }
    }

    _determineWinningSelection()
    {
        let selections = Object.values(this._selectionByClientId);

        // Count votes
        let numVotesBySelection = {};
        for (const selection of selections)
        {
            if (selection in numVotesBySelection)
            {
                numVotesBySelection[selection] = 0;
            }
            else
            {
                numVotesBySelection[selection] += 1;
            }
        }

        // Who has the most votes, if anyone?
        let mostPopularSelection = null;
        let highestNumVotes = 0;
        for (const [selection, numVotes] of Object.entries(numVotesBySelection))
        {
            if (numVotes > highestNumVotes)
            {
                highestNumVotes = numVotes;
                mostPopularSelection = selection;
            }
        }

        // Has anyone won? If so, return the popular choice
        let winnerExists = highestNumVotes > 1 || highestNumVotes == this._clientIds.length;
        if (winnerExists)
        {
            return mostPopularSelection;
        }

        // A tie -- just pick a winner at random
        return selections[Math.floor(Math.random() * selections.length)];
    }

    _sendPeerState()
    {
        let state = new SelectGamePeerState(this._selectionByClientId[this._ourClientId]);
        this._sendMessageFn(new PeerStateMessage(this._ourClientId, this.className, state));
    }

    _onFunniestImageGameButtonClicked(button)
    {
        this._deselectAllButtons();
        button.addClass("button-selected");
        this._selectionByClientId[this._ourClientId] = "FunniestImageGame";
        this._sendPeerState();
        this._tryStartGame();
    }

    _onMovieGameButtonClicked(button)
    {
        this._deselectAllButtons();
        button.addClass("button-selected");
        this._selectionByClientId[this._ourClientId] = "MovieGame";
        this._sendPeerState();
        this._tryStartGame();
    }

    _deselectAllButtons()
    {
        for (const button of this._gameButtons)
        {
            button.removeClass("button-selected");
        }
    }

    constructor(ourClientId, gameId, gameClientIds, sendMessageFn)
    {
        super();
        let self = this;

        this._ourClientId = ourClientId;
        this._selectionByClientId = {};
        this._clientIds = gameClientIds.slice();

        this._sendMessageFn = sendMessageFn;

        let funniestImageGameButton = $("#SelectGameScreen #FunniestImageGameButton")
        let movieGameButton = $("#SelectGameScreen #MovieGameButton");
        funniestImageGameButton.off("click").click(function() { self._onFunniestImageGameButtonClicked(funniestImageGameButton) });
        movieGameButton.off("click").click(function() { self._onMovieGameButtonClicked(movieGameButton) });
        this._gameButtons = [ funniestImageGameButton, movieGameButton ];
        this._deselectAllButtons();

        $("#SelectGameScreen #GameID").val(gameId);

        $("#SelectGameScreen").show();
    }
}

export { SelectGameScreen };