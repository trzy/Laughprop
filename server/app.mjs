/*
 * app.mjs
 * Bart Trzynadlowski, 2023
 *
 * Laughprop server. Defined as a .mjs file so we can use the ES6 module system and share modules
 * with client code.
 */

import express from "express";
import { WebSocketServer } from "ws";
import
{
    tryParseMessage,
    HelloMessage,
    GameStartingStateMessage,
    FailedToJoinMessage,
    SelectGameStateMessage
} from "./public/js/modules/messages.mjs";
import { generateSessionId } from "./modules/utils.mjs";


/**************************************************************************************************
 Session and Game State
**************************************************************************************************/

const _sessionById = {};

class Session
{
    sessionId;
    clientIds;  // set of clients

    _gameVoteByClientId;    // game selections, when this is not empty, voting is in progress

    tryAddClientIfAccepting(clientId)
    {
        this.clientIds.add(clientId);
        //TODO: when we have state implemented, stop accepting clients after game selected
        return false;
    }

    removeClient(clientId)
    {
        this.clientIds.delete(clientId);
        delete this._gameVoteByClientId[clientId];
        //TODO: abort game if too few clients remaining?

        // If we are in game selection state, try tallying vote
        this._tryTallyGameVotes();
    }

    hasClient(clientId)
    {
        return this.clientIds.has(clientId);
    }

    voteForGame(clientId, gameName)
    {
        this._gameVoteByClientId[clientId] = gameName;
        this._tryTallyGameVotes();
    }

    sendMessage(msg)
    {
        for (const clientId of this.clientIds)
        {
            const socket = _socketByClientId[clientId];
            if (socket)
            {
                sendMessage(socket, msg);
            }
        }
    }

    _tryTallyGameVotes()
    {
        const numClientsVoted = Object.keys(this._gameVoteByClientId).length;
        if (numClientsVoted == this.clientIds.size && this.clientIds.size > 1)
        {
            const gameName = this._getVotedGame();
            this._startGame(gameName);
            this._gameVoteByClientId = {};
        }
    }

    _getVotedGame()
    {
        const numVotesByGame = {};
        let highestVotedGame = null;
        let highestVoteCount = 0;

        for (const [clientId, gameName] of Object.entries(this._gameVoteByClientId))
        {
            if (!(gameName in numVotesByGame))
            {
                numVotesByGame[gameName] = 1;
            }
            else
            {
                numVotesByGame[gameName] += 1;
            }

            if (numVotesByGame[gameName] > highestVoteCount)
            {
                highestVoteCount = numVotesByGame[gameName];
                highestVotedGame = gameName;
            }
        }

        return highestVotedGame;
    }

    _startGame(gameName)
    {
        console.log(`Starting game: ${gameName}`);
    }

    constructor(sessionId)
    {
        this.game = null;
        this.sessionId = sessionId;
        this.clientIds = new Set();
        this._gameVoteByClientId = {};
    }
}

function tryGetSessionByClientId(clientId)
{
    for (const [sessionId, session] of Object.entries(_sessionById))
    {
        if (session.hasClient(clientId))
        {
            return session;
        }
    }
    return null;
}


/**************************************************************************************************
 Socket and Message Handling
**************************************************************************************************/

const _handlerByMessageId =
{
    "HelloMessage": onHelloMessage,
    "StartNewGameMessage": onStartNewGameMessage,
    "JoinGameMessage": onJoinGameMessage,
    "ChooseGameMessage": onChooseGameMessage
};

const _socketByClientId = {};

function tryGetClientIdBySocket(socket)
{
    let clientId = null;

    for (const [otherClientId, otherSocket] of Object.entries(_socketByClientId))
    {
        if  (socket == otherSocket)
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

function onSocketClosed(socket)
{
    let clientId = tryGetClientIdBySocket(socket);

    if (clientId)
    {
        delete _socketByClientId[clientId];
        for (const session of Object.values(_sessionById))
        {
            session.removeClient(clientId);
        }
    }

    console.log(`ClientId ${clientId} disconnected. ${Object.keys(_socketByClientId).length} remaining.`);
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
    if (msg.clientId in _socketByClientId)
    {
        console.log(`Error: ClientId=${msg.clientId} already exists. Replacing...`);
    }
    _socketByClientId[msg.clientId] = socket;

    let sessionId;
    do
    {
        sessionId = generateSessionId();
    } while (sessionId in _sessionById);
    _sessionById[sessionId] = new Session(sessionId);
    _sessionById[sessionId].tryAddClientIfAccepting(msg.clientId);
    sendMessage(socket, new GameStartingStateMessage(sessionId));

    console.log(`Created game sessionId=${sessionId}`);
}

function onJoinGameMessage(socket, msg)
{
    // Joins an existing game session and also identifies the client for the first time
    console.log(`Join game request: clientId=${msg.clientId}`);
    if (msg.clientId in _socketByClientId)
    {
        console.log(`Error: ClientId=${msg.clientId} already exists. Replacing...`);
    }
    _socketByClientId[msg.clientId] = socket;

    if (!(msg.sessionId in _sessionById))
    {
        console.log(`Error: Uknown sessionId=${msg.sessionId}`);
        sendMessage(socket, new FailedToJoinMessage());
    }
    else
    {
        const session = _sessionById[msg.sessionId];
        if (session.tryAddClientIfAccepting(msg.clientId))
        {
            console.log(`Error: Rejected clientId=${msg.clientId} because game is full`);
            sendMessage(socket, new FailedToJoinMessage());
        }
        else
        {
            session.sendMessage(new SelectGameStateMessage(msg.sessionId));
        }
    }
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


/**************************************************************************************************
 Program Entry Point
**************************************************************************************************/

// Web server
const port = 8080;
const app = express();
app.use(express.static("public"));
const server = app.listen(port, () =>
{
    console.log(`Laughprop web server listening on port ${port}`);
});

// Socket
const wsServer = new WebSocketServer({ server: server });
wsServer.on('connection', socket =>
{
    socket.on('message', function(buffer) { onMessageReceived(socket, buffer) });
    socket.onclose = function(event)
    {
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