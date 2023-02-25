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
    _our_client_id;
    _selection_by_client_id;
    _client_ids;

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
            this._client_ids = msg.client_ids;
            console.log("Current number of clients: " + this._client_ids.length);
            this._sendMessageFn(new AuthoritativeStateMessage(SelectGameScreen.name, {}));
            // TODO: authoritative state must integrate peer states because peer state update alone may be
            //       missed if received before the authoritative state update from actual authority
            this._sendPeerState();  // peer state after authoritative state
        }
        else if (msg instanceof PeerStateMessage)
        {
            // Someone sent us their selection
            this._selection_by_client_id[msg.from_client_id] = msg.state.selection;
            console.log("Current game selections:", this._selection_by_client_id);
        }
    }

    _sendPeerState()
    {
        let state = new SelectGamePeerState(this._selection_by_client_id[this._our_client_id]);
        this._sendMessageFn(new PeerStateMessage(this._our_client_id, this.className, state));
    }

    _onFunniestImageGameButtonClicked(button)
    {
        this._deselectAllButtons();
        button.addClass("button-selected");
        this._selection_by_client_id[this._our_client_id] = "FunniestImageGame";
        this._sendPeerState();
    }

    _onMovieGameButtonClicked(button)
    {
        this._deselectAllButtons();
        button.addClass("button-selected");
        this._selection_by_client_id[this._our_client_id] = "MovieGame";
        this._sendPeerState();
    }

    _deselectAllButtons()
    {
        for (const button of this._gameButtons)
        {
            button.removeClass("button-selected");
        }
    }

    constructor(client_id, gameId, sendMessageFn)
    {
        super();
        let self = this;

        this._our_client_id = client_id;
        this._selection_by_client_id = {};
        this._client_ids = [];

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