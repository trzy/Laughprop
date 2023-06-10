/*
 * app.mjs
 * Bart Trzynadlowski, 2023
 *
 * Laughprop server. Defined as a .mjs file so we can use the ES6 module system and share modules
 * with client code.
 *
 * TODO Next:
 * ----------
 * - Games should specify how many users are required to play. Drawing game cannot drop any users once
 *   it starts.
 * - Image requests need to be properly serialized because option get requests return immediately and
 *   it is not clear if they are returning the currently-used options or last-set options, so even if
 *   image server is serializing internally, we may have an issue where we fail to set the model
 *   correctly. Need to wait till one request is done before beginning the next.
 * - Fix CSS (centering of candidate images).
 * - Socket reconnect on front-end? Don't remove dead clients until after some timeout here, allowing
 *   them to resume? If we do this, must perform replay. Alternatively, can remove clients immediately
 *   but preserve their scripting contexts in an "archive" for resumption. Not sure if this is possible
 *   when the game has moved on too far. Indeed, may need to just avoid purging until after some timeout
 *   has been exceeded (say, 10 seconds).
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

const _handlerByMessageId =
{
    "HelloMessage": onHelloMessage,
    "StartNewGameMessage": onStartNewGameMessage,
    "JoinGameMessage": onJoinGameMessage,
    "LeaveGameMessage": onLeaveGameMessage,
    "ChooseGameMessage": onChooseGameMessage,
    "ClientInputMessage": onClientInputMessage
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

function sendMessageToClient(clientId, msg)
{
    const socket = _socketByClientId[clientId];
    if (socket)
    {
        sendMessage(socket, msg);
    }
    else
    {
        console.log(`Error: Cannot send message because no socket exists for clientId=${clientId}`);
    }
}

function onSocketClosed(socket)
{
    let clientId = tryGetClientIdBySocket(socket);

    if (clientId)
    {
        delete _socketByClientId[clientId];
        for (const session of Object.values(_sessionById))
        {
            removeClientFromSession(session, clientId);
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
    if (msg.clientId in _socketByClientId)
    {
        console.log(`Error: ClientId=${msg.clientId} already exists. Replacing...`);
    }
    _socketByClientId[msg.clientId] = socket;

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