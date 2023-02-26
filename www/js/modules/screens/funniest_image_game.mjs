/*
 * www/js/modules/screens/funniest_image_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Funniest image game UI screen.
 */

import { UIScreen } from "./ui_screen.mjs";
import { ClientSnapshotMessage, AuthoritativeStateMessage } from "../messages.mjs";

class FunniestImageGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // State
    _ourClientId;
    _clientIds;

    get className()
    {
        return FunniestImageGameScreen.name;
    }

    onMessageReceived(msg)
    {
        if (msg instanceof ClientSnapshotMessage)
        {
            // Client snapshot indicates someone joined or left. We must sent a state update in return.
            this._clientIds = msg.client_ids;
            console.log("Current number of clients: " + this._clientIds.length);
            this._sendMessageFn(new AuthoritativeStateMessage(this.className, {}));
            this._sendPeerState();  // peer state after authoritative state
        }
    }

    constructor(ourClientId, gameId, gameClientIds, sendMessageFn)
    {
        super();
        let self = this;

        this._ourClientId = ourClientId;
        this._clientIds = gameClientIds.slice();

        this._sendMessageFn = sendMessageFn;

        $("#FunniestImageGameScreen").show();
    }
}

export { FunniestImageGameScreen };