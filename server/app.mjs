/**
 ** Laughprop
 ** A Stable Diffusion Party Game
 ** Copyright 2023 Bart Trzynadlowski, Steph Ng
 **
 ** This file is part of Laughprop.
 **
 ** Laughprop is free software: you can redistribute it and/or modify it under
 ** the terms of the GNU General Public License as published by the Free
 ** Software Foundation, either version 3 of the License, or (at your option)
 ** any later version.
 **
 ** Laughprop is distributed in the hope that it will be useful, but WITHOUT
 ** ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 ** FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
 ** more details.
 **
 ** You should have received a copy of the GNU General Public License along
 ** with Laughprop.  If not, see <http://www.gnu.org/licenses/>.
 **/

/*
 * app.mjs
 * Bart Trzynadlowski, 2023
 *
 * Laughprop server. Defined as a .mjs file so we can use the ES6 module system and share modules
 * with client code.
 *
 * Limited support for socket disconnects. If a client socket disconnects, the client is retained
 * for a limited time, allowing a reconnect and re-join attempt with the same client ID. While dis-
 * connected, messages are accumulated, and then released on successful reconnect. Reconnects are
 * only permitted if a game is in progress. Reconnection support has not been thoroughly tested!
 *
 * Our socket messaging protocol is unfortunately stateful and could be improved by keeping a
 * complete model of the client state instead. Images could be sent as IDs, allowing clients to
 * request them as needed.
 *
 * TODO:
 * ----------
 * - Games should specify how many users are required to play. Drawing game cannot drop any users once
 *   it starts.
 */

import express from "express";
import { WebSocketServer } from "ws";
import
{
    tryParseMessage,
    HelloMessage,
    GameStartingStateMessage,
    FailedToJoinMessage,
    ReturnToLobbyMessage,
    SelectGameStateMessage
} from "../frontend/js/modules/messages.mjs";
import { generateSessionId } from "./modules/utils.mjs";
import { Session } from "./modules/session.mjs";
import { ImageGenerator } from "./modules/image_generator.mjs";


/**************************************************************************************************
 Game Sessions
**************************************************************************************************/

const _sessionById = {};

function tryGetSessionByClientId(clientId)
{
    for (const [_, session] of Object.entries(_sessionById))
    {
        if (session.hasClient(clientId))
        {
            return session;
        }
    }
    return null;
}

// Terminates a session. If the game ended normally (in which case players will have returned to
// lobby), gameInterruptedReason is null and no message to the clients will be sent. Otherwise,
// a return-to-lobby request is sent to clients with the interruption reason.
function terminateSession(session, gameInterruptedReason)
{
    for (const [sessionId, otherSession] of Object.entries(_sessionById))
    {
        if (session == otherSession)
        {
            delete _sessionById[sessionId];
        }
    }

    // Force remaining clients to return to lobby if the session was interrupted
    if (gameInterruptedReason)
    {
        const msg = new ReturnToLobbyMessage(gameInterruptedReason);
        session.sendMessage(msg);
        console.log(`Terminated sessionId=${session.id()} because game was interrupted: ${gameInterruptedReason}`);
    }
    else
    {
        console.log(`Terminated sessionId=${session.id()} normally`);
    }
}

function removeClientFromSession(session, clientId)
{
    session.removeClient(clientId);
    if (session.numClients() <= 0)
    {
        terminateSession(session, null);
    }
    else if (session.numClients() <= 1 && session.isGameSelectionInProgress())
    {
        // Players backed out of game selection state and we are down to 1. Back out of
        // selection screen. Reset session state to clear any game selection logic.
        session.sendMessage(new GameStartingStateMessage(session.id()))
        session.resetVotes();
    }
    else if (session.numClients() <= 1 && session.isGameInProgress())
    {
        // Too few players remaining in game, terminate session
        terminateSession(session, "Game aborted because too many players left or disconnected.");
    }
}


/**************************************************************************************************
 Socket and Message Handling
**************************************************************************************************/

class Client
{
    clientId;
    socket;

    _pendingMessages = [];  // enqueued messages when socket is disconnected
    _disconnectedAt = Infinity;

    getDisconnectedDuration()
    {
        if (this.socket != null)
        {
            // Still connected
            return 0
        }
        return Date.now() - this._disconnectedAt;
    }

    isConnected()
    {
        return this.socket != null;
    }

    setConnected(isConnected, newSocket)
    {
        if (isConnected)
        {
            this.socket = newSocket;
            this._disconnectedAt = Infinity;

            // Send out enqueued messages
            for (const msg of this._pendingMessages)
            {
                sendMessage(this.socket, msg);
            }
            this._pendingMessages = [];
        }
        else
        {
            this.socket = null;
            this._disconnectedAt = Date.now();
        }
    }

    sendMessage(msg)
    {
        if (this.isConnected())
        {
            // Send immediately
            sendMessage(this.socket, msg);
        }
        else
        {
            // We are not connected. Enqueue for sending on re-connect.
            this._pendingMessages.push(msg);
        }
    }

    constructor(clientId, socket)
    {
        this.clientId = clientId;
        this.socket = socket;
    }
}

const _handlerByMessageId =
{
    "HelloMessage": onHelloMessage,
    "StartNewGameMessage": onStartNewGameMessage,
    "JoinGameMessage": onJoinGameMessage,
    "RejoinGameMessage": onRejoinGameMessage,
    "LeaveGameMessage": onLeaveGameMessage,
    "ChooseGameMessage": onChooseGameMessage,
    "ClientInputMessage": onClientInputMessage
};

const _clientById = {};

function purgeDeadClients()
{
    // Any clients that have been disconnected for too long are removed

    const timeout = 30e3;

    const clientIdsToRemove = [];

    for (const [clientId, client] of Object.entries(_clientById))
    {
        const duration = client.getDisconnectedDuration();
        if (duration > timeout)
        {
            console.log(`Scheduling clientId=${clientId} for removal because it has been disconnected for ${duration/1000} seconds`);
            clientIdsToRemove.push(clientId);
        }
    }

    for (const clientId of clientIdsToRemove)
    {
        removeClient(clientId);
    }
}

function removeClient(clientId)
{
    if (clientId in _clientById)
    {
        delete _clientById[clientId];
        for (const session of Object.values(_sessionById))
        {
            removeClientFromSession(session, clientId);
        }
        console.log(`ClientId ${clientId} disconnected. ${Object.keys(_clientById).length} remaining.`);
    }
}

function tryGetClientIdBySocket(socket)
{
    let clientId = null;

    for (const [otherClientId, otherClient] of Object.entries(_clientById))
    {
        if  (socket == otherClient.socket)
        {
            clientId = otherClientId;
        }
    }

    return clientId;
}

function sendMessage(socket, msg)
{
    socket.send(JSON.stringify(msg));
}

function sendMessageToClient(clientId, msg)
{
    const client = _clientById[clientId];
    if (client)
    {
        client.sendMessage(msg);
    }
    else
    {
        console.log(`Error: Cannot send message because no client exists for clientId=${clientId}`);
    }
}

function onSocketClosed(socket)
{
    // On a disconnect, we don't actually purge the client in case it tries to later reconnect.
    // Instead, we mark it as disconnected (it will be purged after a timeout).

    let clientId = tryGetClientIdBySocket(socket);

    if (clientId && (clientId in _clientById))
    {
        _clientById[clientId].setConnected(false);
    }

    console.log(`ClientId ${clientId} disconnected. Not yet removed.`);
}

function onMessageReceived(socket, buffer)
{
    let json;
    try
    {
        json = JSON.parse(buffer);
    }
    catch (error)
    {
        console.log(`Error: Unable to parse JSON message: ${buffer.toString()}`);
        return;
    }

    const msg = tryParseMessage(json);
    if (msg != null)
    {
        const handler = _handlerByMessageId[msg.__id];
        if (handler)
        {
            handler(socket, msg);
        }
        else
        {
            console.log(`Error: No handler for ${msg.__id}`);
        }
    }
    else
    {
        console.log(`Error: Unable to decode message: ${buffer.toString()}`);
    }
}

function onHelloMessage(socket, msg)
{
    console.log(`Client says hello: ${msg.message}`);
    sendMessage(socket, new HelloMessage("Hello from Laughprop server"));
}

function onStartNewGameMessage(socket, msg)
{
    // Starts a new game session and also identifies the client for the first time
    console.log(`New game request: clientId=${msg.clientId}`);
    if (msg.clientId in _clientById)
    {
        console.log(`Error: ClientId=${msg.clientId} already exists. Replacing...`);
    }
    _clientById[msg.clientId] = new Client(msg.clientId, socket);

    // Generate unique session ID
    let sessionId;
    do
    {
        sessionId = generateSessionId();
    } while (sessionId in _sessionById);

    // Remove client from other sessions (should not be necessary but in case there is some issue
    // with detecting socket disconnects, etc.)
    for (const [_, session] of Object.entries(_sessionById))
    {
        removeClientFromSession(session, msg.clientId);
    }

    // Create session
    const session = new Session(sessionId, sendMessageToClient, terminateSession, _imageGenerator);
    session.tryAddClientIfAccepting(msg.clientId);
    _sessionById[sessionId] = session;

    sendMessage(socket, new GameStartingStateMessage(sessionId));

    console.log(`Created game sessionId=${sessionId}`);
}

function onJoinGameMessage(socket, msg)
{
    // Joins an existing game session and also identifies the client for the first time
    console.log(`Join game request: clientId=${msg.clientId}`);
    if (msg.clientId in _clientById)
    {
        console.log(`Error: ClientId=${msg.clientId} already exists. Replacing...`);
    }
    _clientById[msg.clientId] = new Client(msg.clientId, socket);

    if (!(msg.sessionId in _sessionById))
    {
        console.log(`Error: Uknown sessionId=${msg.sessionId}`);
        sendMessage(socket, new FailedToJoinMessage("Invalid game code. Maybe the game is finished or you mis-typed a zero as an 'O'?"));
    }
    else
    {
        // Remove client from other sessions (should not be necessary but in case there is some issue
        // with detecting socket disconnects, etc.)
        for (const [_, session] of Object.entries(_sessionById))
        {
            removeClientFromSession(session, msg.clientId);
        }

        // Add client to session
        const session = _sessionById[msg.sessionId];
        if (session.tryAddClientIfAccepting(msg.clientId))
        {
            session.sendMessage(new SelectGameStateMessage(msg.sessionId));
        }
        else
        {
            console.log(`Error: Rejected clientId=${msg.clientId} because game is full`);
            sendMessage(socket, new FailedToJoinMessage("Sorry, you're too late. That game has already started."));
        }
    }
}

function onRejoinGameMessage(socket, msg)
{
    // This will attempt to rejoin a game if that session still exists, otherwise we ask the client to return to lobby
    if (!(msg.sessionId in _sessionById))
    {
        sendMessage(socket, new ReturnToLobbyMessage("Connection error. Unable to rejoin game that is no longer active."));
        removeClient(msg.clientId); // rejoin failed, must remove client
        return;
    }

    if (!(msg.clientId in _clientById))
    {
        sendMessage(socket, new ReturnToLobbyMessage("Connection error. Connection to server was lost."));
        removeClient(msg.clientId);
        return;
    }

    _clientById[msg.clientId].setConnected(true, socket);
}

function onLeaveGameMessage(socket, msg)
{
    // Leave existing session
    let clientId = tryGetClientIdBySocket(socket);
    if (!clientId)
    {
        console.log(`Error: Received LeaveGameMessage on a socket with no associated clientId`);
        return;
    }

    const session = tryGetSessionByClientId(clientId);
    if (!session)
    {
        console.log(`Error: Received LeaveGameMessage from clientId=${clientId} but unable to find session`);
        return;
    }

    removeClientFromSession(session, clientId);
    console.log(`Client clientId=${clientId} left session: ${session.id()}`);
}

function onChooseGameMessage(socket, msg)
{
    let clientId = tryGetClientIdBySocket(socket);
    if (!clientId)
    {
        console.log(`Error: Received ChooseGameMessage on a socket with no associated clientId`);
        return;
    }

    const session = tryGetSessionByClientId(clientId);
    if (!session)
    {
        console.log(`Error: Received ChooseGameMessage from clientId=${clientId} but unable to find session`);
        return;
    }

    console.log(`Client clientId=${clientId} chose game: ${msg.gameName}`);
    session.voteForGame(clientId, msg.gameName);
}

function onClientInputMessage(socket, msg)
{
    let clientId = tryGetClientIdBySocket(socket);
    if (!clientId)
    {
        console.log(`Error: Received ClientInputMessage on a socket with no associated clientId`);
        return;
    }

    const session = tryGetSessionByClientId(clientId);
    if (!session)
    {
        console.log(`Error: Received ClientInputMessage from clientId=${clientId} but unable to find session`);
        return;
    }

    try
    {
        console.log(`Client clientId=${clientId} sent input: ${JSON.stringify(msg.inputs)}`);
    }
    catch (error)
    {
        console.log(`Client clientId=${clientId} sent input`);
    }

    session.receiveInputFromClient(clientId, msg.inputs);
}


/**************************************************************************************************
 Command Line Parameters
**************************************************************************************************/

class Options
{
    useLocalImageServer = false;
}

function processCommandLine()
{
    const options = new Options();

    for (let i = 2; i < process.argv.length; i++)
    {
        if (process.argv[i] == "-h" || process.argv[i] == "-?" || process.argv[i] == "--help" || process.argv[i] == "-help")
        {
            console.log("laughprop server");
            console.log("usage: node app.mjs [options]");
            console.log("options:");
            console.log("  --help, -help, -?, -h   Print this help text.");
            console.log("  --local                 Use local image server.");
            process.exit();
        }
        else if (process.argv[i] == "--local")
        {
            options.useLocalImageServer = true;
        }
    }

    return options;
}


/**************************************************************************************************
 Program Entry Point
**************************************************************************************************/

const options = processCommandLine();

// Image generation handler
const _imageGenerator = new ImageGenerator(_sessionById, options.useLocalImageServer);

// Web server
const port = 8080;
const app = express();
app.use(express.static("../frontend"));
const server = app.listen(port, () =>
{
    console.log(`Laughprop web server listening on port ${port}`);
});

// Socket
const wsServer = new WebSocketServer({ server: server });
wsServer.on('connection', socket =>
{
    let interval = setInterval(() => socket.ping(), 5e3);
    socket.on('message', function(buffer) { onMessageReceived(socket, buffer) });
    socket.onclose = function(event)
    {
        clearInterval(interval);
        if (event.wasClean)
        {
            console.log(`Connection closed (code=${event.code}, reason=${event.reason})`);
        }
        else
        {
            console.log(`Connection died (code=${event.code}, reason=${event.reason})`);
        }
        onSocketClosed(socket);
    };
});

// Periodic task to clean up disconnected clients
setInterval(purgeDeadClients, 5e3);