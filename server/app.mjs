/*
 * app.mjs
 * Bart Trzynadlowski, 2023
 *
 * Laughprop server. Defined as a .mjs file so we can use the ES6 module system and share modules
 * with client code.
 *
 * TODO Next:
 * ----------
 * - Clean up state variable substitution. Probably should rename the function to "expand" and support
 *   @/@@ notation for full variable substitution vs. %/%% for string replacement.
 * - Real image generation.
 * - Movie game.
 * - Socket reconnect on front-end? Don't remove dead clients until after some timeout here, allowing
 *   them to resume? If we do this, must perform replay. Alternatively, can remove clients immediately
 *   but preserve their scripting contexts in an "archive" for resumption. Not sure if this is possible
 *   when the game has moved on too far. Indeed, may need to just avoid purging until after some timeout
 *   has been exceeded (say, 10 seconds).
 */

//import http from "http";
import fs from "fs";
import crypto from "crypto";
import express from "express";
import { WebSocketServer } from "ws";
import
{
    tryParseMessage,
    HelloMessage,
    GameStartingStateMessage,
    FailedToJoinMessage,
    ReturnToLobbyMessage,
    SelectGameStateMessage,
    ClientUIMessage,
} from "./public/js/modules/messages.mjs";
import { generateSessionId, randomChoice, tallyVotes } from "./modules/utils.mjs";
import * as variable_expansion from "./modules/variable_expansion.mjs";
import * as themed_image_game from "./modules/games/themed_image.mjs";


/**************************************************************************************************
 Session and Game State
**************************************************************************************************/

const _sessionById = {};

class ScriptingContext
{
    state = {};

    _actions;
    _actionIdx = 0;

    getCurrentScriptAction()
    {
        return this._actionIdx < this._actions.length ? this._actions[this._actionIdx] : null;
    }

    goToNext()
    {
        if (this._actionIdx < this._actions.length)
        {
            this._actionIdx += 1;
        }
    }

    isFinished()
    {
        return this._actionIdx >= this._actions.length;
    }

    constructor(actions)
    {
        this._actions = actions;
    }
}

class Game
{
    // Game scripting contexts
    _globalScriptCtx;
    _perClientScriptCtx = {};

    // Clients (players in the game). This is a reference to the Session's client set and must be
    // monitored for clients dropping.
    _clientIds;

    // Image cache
    _imageByUuid = {};

    start()
    {
        this._runNext();
    }

    isFinished()
    {
        return this._globalScriptCtx.isFinished();
    }

    receiveInputFromClient(clientId, inputs)
    {
        // Extract state vars and commit them
        for (const [stateVar, value] of Object.entries(inputs))
        {
            this._writeToStateVar(clientId, stateVar, value);
        }

        for (const [clientId, scriptCtx] of Object.entries(this._perClientScriptCtx))
        {
           console.log(`${clientId} -> ${JSON.stringify(Object.keys(scriptCtx.state))}`);
        }

        // Try to advance scripting engine
        this._runNext();
    }

    receiveImageResponse(clientId, destStateVar, imageByUuid)
    {
        // Copy to cache
        for (const [uuid, image] of Object.entries(imageByUuid))
        {
            this._imageByUuid[uuid] = image;
        }

        // Write
        this._writeToStateVar(clientId, destStateVar, imageByUuid);

        // Try to advance scripting engine
        this._runNext();
    }

    _runNext()
    {
        // First, process per-client actions
        this._runNextPerClient();

        // Next, run global actions
        this._runUntilBlocked(this._globalScriptCtx, null);
    }

    _runNextPerClient()
    {
        // First, purge dead clients
        for (const clientId in this._perClientScriptCtx)
        {
            const clientExists = this._clientIds.has(clientId);
            if (!clientExists)
            {
                delete this._perClientScriptCtx[clientId];
            }
        }

        // Execute per-client scripts
        for (const [clientId, scriptCtx] of Object.entries(this._perClientScriptCtx))
        {
           this._runUntilBlocked(scriptCtx, clientId);
        }
    }

    _runUntilBlocked(scriptCtx, clientId)
    {
        let canProceed = true;
        while (canProceed && !scriptCtx.isFinished())
        {
            const action = scriptCtx.getCurrentScriptAction();
            canProceed = this._execute(action, clientId);
            if (canProceed)
            {
                scriptCtx.goToNext();
            }
        }

        if (scriptCtx.isFinished())
        {
            console.log("Finished execution of script");
        }
    }

    _execute(action, clientId)
    {
        console.log(`-- Ctx=${!clientId ? "Global" : clientId} -- ${action.action}`);

        switch (action.action)
        {
        case "init_state":                      return this._do_init_state();
        case "client_ui":                       return this._do_client_ui(action.ui, clientId);
        case "random_choice":                   return this._do_random_choice(action, clientId);
        case "per_client":
            if (clientId != null)
            {
                console.log(`Error: per_client action cannot be nested further`);
                return true;
            }
            else
            {
                return this._do_per_client(action);
            }
        case "wait_for_state_var":              return this._do_wait_for_state_var(action, clientId);
        case "wait_for_state_var_all_users":    return this._do_wait_for_state_var_all_users(action);
        case "txt2img":                         return this._do_txt2img(action, clientId);
        case "gather_client_state_into_set":    return this._do_gather_client_state_into_set(action);
        case "gather_client_state_into_array":  return this._do_gather_client_state_into_array(action);
        case "gather_images_into_map":          return this._do_gather_images_into_map(action, clientId);
        case "vote":                            return this._do_vote(action, clientId);
        default:
            console.log(`Error: Unknown action: ${action.action}`);
            return false;
        }
    }

    _writeToStateVar(clientId, variable, value)
    {
        // Get local and global state
        const globalState = this._globalScriptCtx.state;
        let localState = null;
        if (clientId)
        {
            const scriptCtx = this._perClientScriptCtx[clientId];
            if (scriptCtx)
            {
                localState = scriptCtx.state;
            }
        }

        if (variable.startsWith("@@"))
        {
            if (localState)
            {
                localState[variable] = value;
            }
            else
            {
                console.log(`Error: ClientId is null. Cannot write client-local variable: ${variable}`);
            }
        }
        else if (variable.startsWith("@"))
        {
            globalState[variable] = value;
        }
        else
        {
            console.log(`Error: Invalid state variable name: ${variable}. Must begin with '@' or '@@'.`);
        }
    }

    _checkStateVarExists(clientId, variable)
    {
        // Get local and global state
        const globalState = this._globalScriptCtx.state;
        let localState = null;
        if (clientId)
        {
            const scriptCtx = this._perClientScriptCtx[clientId];
            if (scriptCtx)
            {
                localState = scriptCtx.state;
            }
        }

        if (variable.startsWith("@@"))
        {
            if (localState)
            {
                return variable in localState;
            }
            else
            {
                console.log(`Error: ClientId is null. Cannot test client-local variable: ${variable}`);
            }
        }
        else if (variable.startsWith("@"))
        {
            return variable in globalState;
        }

        return false;
    }

    _expandStateVar(clientId, variable)
    {
        // Get local and global state
        const globalState = this._globalScriptCtx.state;
        let localState = null;
        if (clientId)
        {
            const scriptCtx = this._perClientScriptCtx[clientId];
            if (scriptCtx)
            {
                localState = scriptCtx.state;
            }
        }

        // Perform expansion
        return variable_expansion.expand(variable, globalState, localState);
    }

    _do_init_state()
    {
        this._globalScriptCtx.state = {};
        for (const [_, scriptCtx] of Object.entries(this._perClientScriptCtx))
        {
            scriptCtx.state = {};
        }
        return true;
    }

    _do_client_ui(ui, clientId)
    {
        // Substitute variable if needed
        let param = ui.param ? this._expandStateVar(clientId, ui.param) : null;

        // Send to client(s)
        const msg = new ClientUIMessage({ command: ui.command, param: param });
        if (clientId == null)
        {
            sendMessageToClients(this._clientIds, msg);
        }
        else
        {
            sendMessageToClient(clientId, msg);
        }

        return true;
    }

    _do_random_choice(action, clientId)
    {
        this._writeToStateVar(clientId, action.writeToStateVar, randomChoice(action.choices));
        return true;
    }

    _do_per_client(action)
    {
        // Set up new per-client scripting contexts
        for (const clientId of this._clientIds)
        {
            this._perClientScriptCtx[clientId] = new ScriptingContext(action.actions);
        }

        // Kick it off
        this._runNextPerClient();

        return true;
    }

    _do_wait_for_state_var(action, clientId)
    {
        return this._checkStateVarExists(clientId, action.stateVar);
    }

    _do_wait_for_state_var_all_users(action)
    {
        if (!action.stateVar.startsWith("@@"))
        {
            console.log(`Error: wait_for_state_var_all_users expected a per-client state variable but got: ${action.stateVar}`);
            return false;
        }

        let present = true;
        for (const clientId of this._clientIds)
        {
            present &= this._checkStateVarExists(clientId, action.stateVar);
        }
        return present;
    }

    _do_txt2img(action, clientId)
    {
        const prompt = this._expandStateVar(clientId, action.prompt);
        makeTxt2ImgRequest(clientId, prompt, action.writeToStateVar);
        return true;
    }

    _do_gather_client_state_into_set(action)
    {
        if (!action.clientStateVar.startsWith("@@"))
        {
            console.log(`Error: gather_client_state_into_set expected a per-client state variable but got: ${action.clientStateVar}`);
            return false;
        }

        const aggregated = new Set();
        for (const clientId of this._clientIds)
        {
            const variable = this._expandStateVar(clientId, action.clientStateVar);
            if (variable)
            {
                aggregated.add(variable);
            }
        }

        this._writeToStateVar(null, action.writeToStateVar, aggregated);

        return true;
    }

    _do_gather_client_state_into_array(action)
    {
        if (!action.clientStateVar.startsWith("@@"))
        {
            console.log(`Error: gather_client_state_into_array expected a per-client state variable but got: ${action.clientStateVar}`);
            return false;
        }

        const aggregated = [];
        for (const clientId of this._clientIds)
        {
            const variable = this._expandStateVar(clientId, action.clientStateVar);
            if (variable)
            {
                aggregated.push(variable);
            }
        }

        this._writeToStateVar(null, action.writeToStateVar, aggregated);

        return true;
    }

    _do_gather_images_into_map(action, clientId)
    {
        const selectedImageIds = this._expandStateVar(clientId, action.fromStateVar);
        if (!selectedImageIds)
        {
            console.log(`Error: gather_images_into_map was unable to read from ${action.fromStateVar}`);
            return false;
        }

        const aggregated = {};
        for (const uuid of selectedImageIds)
        {
            const image = this._imageByUuid[uuid];
            if (image)
            {
                aggregated[uuid] = image;
            }
            else
            {
                console.log(`Error: Unknown image UUID=${uuid}`);
            }
        }

        this._writeToStateVar(clientId, action.writeToStateVar, aggregated);

        return true;
    }

    _do_vote(action, clientId)
    {
        const votes = this._expandStateVar(clientId, action.stateVar);
        if (!votes || !(votes.length > 0))
        {
            console.log(`Error: Unable to vote on null or empty vote array read from ${action.stateVar}`);
            return false;
        }

        const winningVotes = tallyVotes(votes);
        this._writeToStateVar(clientId, action.writeToStateVar, winningVotes);

        return true;
    }

    constructor(actions, clientIds)
    {
        this._globalScriptCtx = new ScriptingContext(actions);
        this._clientIds = clientIds;
    }
}

class Session
{
    _sessionId;
    _clientIds = new Set();     // set of clients
    _gameVoteByClientId = {};   // game selections, when this is not empty, voting is in progress
    _game;

    id()
    {
        return this._sessionId;
    }

    // Returns true if client was accepted into game session, otherwise false if game is full.
    tryAddClientIfAccepting(clientId)
    {
        if (this.isGameInProgress())
        {
            // Game in progress, reject.
            return false;
        }
        this._clientIds.add(clientId);
        return true;
    }

    removeClient(clientId)
    {
        this._clientIds.delete(clientId);
        delete this._gameVoteByClientId[clientId];

        // If we are in game selection state, try tallying vote and start game
        if (this.isGameSelectionInProgress())
        {
            this._tryStartGame();
        }
    }

    hasClient(clientId)
    {
        return this._clientIds.has(clientId);
    }

    numClients()
    {
        return this._clientIds.size;
    }

    isGameInProgress()
    {
        return this._game != null && !this._game.isFinished();
    }

    isGameSelectionInProgress()
    {
        // Game selection occurs only before any game has ever been chosen and played
        return !this._game;
    }

    voteForGame(clientId, gameName)
    {
        this._gameVoteByClientId[clientId] = gameName;
        this._tryStartGame();
    }

    resetVotes()
    {
        this._gameVoteByClientId = {};
    }

    receiveInputFromClient(clientId, inputs)
    {
        // Pass to game, which makes it tick
        if (this._game)
        {
            this._game.receiveInputFromClient(clientId, inputs);

            // Once finished, remove session
            if (!this.isGameInProgress())
            {
                terminateSession(this, null);
            }
        }
    }

    receiveImageResponse(clientId, destStateVar, imageByUuid)
    {
        // Pass to game, which makes it tick
        if (this._game)
        {
            this._game.receiveImageResponse(clientId, destStateVar, imageByUuid);

            // Once finished, remove session
            if (!this.isGameInProgress())
            {
                terminateSession(this, null);
            }
        }
    }

    sendMessage(msg)
    {
        for (const clientId of this._clientIds)
        {
            const socket = _socketByClientId[clientId];
            if (socket)
            {
                sendMessage(socket, msg);
            }
        }
    }

    _tryStartGame()
    {
        const numClientsVoted = Object.keys(this._gameVoteByClientId).length;
        if (numClientsVoted == this._clientIds.size && this._clientIds.size > 1)
        {
            const gameName = this._getVotedGame();
            this._startGame(gameName);
            this._gameVoteByClientId = {};
        }
    }

    _getVotedGame()
    {
        const gameNames = Object.values(this._gameVoteByClientId);  // array of game names
        const winningGames = tallyVotes(gameNames);
        return winningGames.length == 1 ? winningGames[0] : randomChoice(winningGames);
    }

    _startGame(gameName)
    {
        console.log(`Starting game: ${gameName}`);
        switch (gameName)
        {
        default:
        case "It's a Mood":
            this._game = new Game(themed_image_game.script, this._clientIds);
            this._game.start();
            break;
        }
    }

    constructor(sessionId)
    {
        this._game = null;
        this._sessionId = sessionId;
    }
}

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
 Image Generation Requests
**************************************************************************************************/

function makeTxt2ImgRequest(clientId, prompt, destStateVar)
{
    function respondWithFakeImage(filepath)
    {
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString("base64");

        // Create 4 copies of the fake image
        const imageByUuid = {};
        for (let i = 0; i < 4; i++)
        {
            imageByUuid[crypto.randomUUID()] = base64;
        }

        const session = tryGetSessionByClientId(clientId);
        if (session)
        {
            session.receiveImageResponse(clientId, destStateVar, imageByUuid);
        }
        else
        {
            console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
        }

    }

    setTimeout(respondWithFakeImage, 1500, "../assets/RickAstley.jpg");
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

// clientIds must be a set
function sendMessageToClients(clientIds, msg)
{
    for (const clientId of clientIds)
    {
        sendMessageToClient(clientId, msg);
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
    const session = new Session(sessionId);
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