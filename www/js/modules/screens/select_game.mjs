/*
 * www/js/modules/screens/select_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Select game UI screen.
 */

import { UIScreen } from "./ui_screen.mjs";
import { ClientSnapshotMessage } from "../messages.mjs";

class SelectGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // State
    _client_ids;

    get className()
    {
        return SelectGameScreen.name;
    }

    onMessageReceived(msg)
    {
        if (msg instanceof ClientSnapshotMessage)
        {
            this._client_ids = msg.client_ids;
            console.log("Current number of clients: " + this._client_ids.length);
        }
    }

    constructor(gameId, sendMessageFn)
    {
        super();
        let self = this;

        this._client_ids = [];

        this._sendMessageFn = sendMessageFn;

        $("#SelectGameScreen #GameID").val(gameId);

        $("#SelectGameScreen").show();
    }
}

export { SelectGameScreen };