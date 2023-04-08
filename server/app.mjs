/*
 * app.mjs
 * Bart Trzynadlowski, 2023
 *
 * Laughprop server. Defined as a .mjs file so we can use the ES6 module system and share modules
 * with client code.
 *
 * TODO Next:
 * ----------
 * - Detect client left game and drop their state, allowing game to continue.
 * - Allow game to end by including a command to explicitly drop client from game, cleaning up session
 *   and all other objects as needed.
 * - Return to lobby.
 * - Real image generation
 * - Movie game.
 * - Socket reconnect on front-end? Don't remove dead clients until after some timeout here, allowing
 *   them to resume? If we do this, must perform replay.
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
    SelectGameStateMessage,
    ClientUIMessage,
} from "./public/js/modules/messages.mjs";
import { generateSessionId, tallyVotes } from "./modules/utils.mjs";


/**************************************************************************************************
 Session and Game State
**************************************************************************************************/

const _sessionById = {};

const _themedImageGameFlow = [
    // Begin by clearing state and display area on client side
    { action: "init_state" },
    { action: "client_ui", ui: { command: "clear_game_div" } },
    { action: "client_ui", ui: { command: "show_title", param: "It's a Mood" } },

    // Select a random theme
    {
        action:             "random_choice",
        writeToStateVar:    "@theme",
        choices:            [
            "Best place to hide in a zombie apocalypse.",
            "A hairy situation.",
            "Celebrities supplementing their income.",
            "Ancient technology.",
            "Creepy mimes.",
        ]
    },
    { action: "client_ui", ui: { command: "show_instructions", param: "Describe a scene that best fits the theme." } },
    { action: "client_ui", ui: { command: "show_prompt_field", param: "@theme" } },

    // Each user must submit a prompt and select a resulting image to submit
    { action: "per_client", actions:
        [
            // Wait for prompt
            { action: "wait_for_state_var", stateVar: "@@prompt" },

            // Generate images
            { action: "client_ui", ui: { command: "show_instructions", param: "Just a moment. Generating images..." } },
            { action: "client_ui", ui: { command: "hide_prompt_field" } },
            { action: "txt2img", prompt: "@@prompt", writeToStateVar: "@@image_candidates" },

            // Wait for image candidates to arrive
            { action: "wait_for_state_var", stateVar: "@@image_candidates" },

            // Send them to client for display
            { action: "client_ui", ui: { command: "show_instructions", param: "Select a generated image to use." } },
            { action: "client_ui", ui: { command: "show_image_carousel", param: "@@image_candidates" } },

            // Wait for user selection
            { action: "wait_for_state_var", stateVar: "@@selected_image_id" },

            // Return to waiting for everyone else
            { action: "client_ui", ui: { command: "hide_image_carousel" } },
            { action: "client_ui", ui: { command: "show_instructions", param: "Hang tight while everyone else makes their selections..." } },
        ]
    },

    // Wait for everyone to have made a submission
    { action: "wait_for_state_var_all_users", stateVar: "@@selected_image_id" },

    // Display everyone's images for voting
    { action: "gather_client_state_into_set", clientStateVar: "@@selected_image_id", writeToStateVar: "@selected_image_ids" },
    { action: "gather_images_into_map", fromStateVar: "@selected_image_ids", writeToStateVar: "@selected_images" },
    { action: "client_ui", ui: { command: "show_candidate_images", param: "@selected_images" } },
    { action: "client_ui", ui: { command: "show_instructions", param: "Vote for the winner!" } },

    // Each user must vote
    { action: "per_client", actions:
        [
            // Wait for vote
            { action: "wait_for_state_var", stateVar: "@@vote" },

            // Wait for everyone else
            { action: "client_ui", ui: { command: "hide_candidate_images" } },
            { action: "client_ui", ui: { command: "show_instructions", param: "Waiting for everyone to vote..." } },
        ]
    },

    // Wait for everyone to vote
    { action: "wait_for_state_var_all_users", stateVar: "@@vote" },

    // Count votes and determine winner
    { action: "gather_client_state_into_array", clientStateVar: "@@vote", writeToStateVar: "@votes" },
    { action: "vote", stateVar: "@votes", writeToStateVar: "@winning_image_ids" },
    { action: "gather_images_into_map", fromStateVar: "@winning_image_ids", writeToStateVar: "@winning_images" },
    { action: "client_ui", ui: { command: "show_winning_images", param: "@winning_images" } },
    { action: "client_ui", ui: { command: "show_instructions", param: "And the winner is..." } },
];

class GameFlowState
{
    state = {};

    _actions;
    _actionIdx = 0;

    getCurrentAction()
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
    // Game flow
    _globalFlow;
    _perClientFlow = {};

    _clientIds;

    _imageByUuid = {};  // image cache

    start()
    {
        this._runNext();
    }

    isFinished()
    {
        return this._globalFlow.isFinished();
    }

    receiveInputFromClient(clientId, inputs)
    {
        // Extract state vars and commit them
        for (const [stateVar, value] of Object.entries(inputs))
        {
            this._writeToStateVar(clientId, stateVar, value);
        }

        for (const [clientId, flow] of Object.entries(this._perClientFlow))
        {
           console.log(`${clientId} -> ${JSON.stringify(Object.keys(flow.state))}`);
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
        this._runUntilBlocked(this._globalFlow, null);
    }

    _runNextPerClient()
    {
        for (const [clientId, flow] of Object.entries(this._perClientFlow))
        {
           this._runUntilBlocked(flow, clientId);
        }
    }

    _runUntilBlocked(flow, clientId)
    {
        let canProceed = true;
        while (canProceed && !flow.isFinished())
        {
            const action = flow.getCurrentAction();
            canProceed = this._execute(action, clientId);
            if (canProceed)
            {
                flow.goToNext();
            }
        }

        if (flow.isFinished())
        {
            console.log("Finished execution of script");
        }
    }

    _execute(action, clientId)
    {
        if (clientId)
        {
            console.log(`-- ${action.action} - clientId=${clientId}`);
        }
        else
        {
            console.log(`-- ${action.action}`);
        }

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
        if (variable.startsWith("@@"))
        {
            // Client-local variable
            if (clientId == null)
            {
                console.log(`Error: ClientId is null. Cannot write client-local variable: ${variable}`);
            }
            else
            {
                const flow = this._perClientFlow[clientId];
                if (!flow)
                {
                    console.log(`Error: No per-client game flow exists for clientId=${clientId}`);
                }
                else
                {
                    const name = variable.slice(2);
                    if (name.length > 0)
                    {
                        flow.state[name] = value;
                    }
                    else
                    {
                        console.log(`Error: Invalid state variable name: ${variable}`);
                    }
                }
            }
        }
        else if (variable.startsWith("@"))
        {
            // Global variable
            const name = variable.slice(1);
            if (name.length > 0)
            {
                this._globalFlow.state[name] = value;
            }
            else
            {
                console.log(`Error: Invalid state variable name: ${variable}`);
            }
        }
        else
        {
            console.log(`Error: Invalid state variable name: ${variable}`);
        }
    }

    _checkStateVarExists(clientId, variable)
    {
        if (variable.startsWith("@@"))
        {
            // Client-local variable
            if (clientId == null)
            {
                console.log(`Error: ClientId is null. Cannot test client-local variable: ${variable}`);
            }
            else
            {
                const flow = this._perClientFlow[clientId];
                if (!flow)
                {
                    console.log(`Error: No per-client game flow exists for clientId=${clientId}`);
                }
                else
                {
                    const name = variable.slice(2);
                    if (name.length > 0)
                    {
                        return name in flow.state;
                    }
                    else
                    {
                        console.log(`Error: Invalid state variable name: ${variable}`);
                    }
                }
            }
        }
        else if (variable.startsWith("@"))
        {
            // Global variable
            const name = variable.slice(1);
            if (name.length > 0)
            {
                return name in this._globalFlow.state;
            }
            else
            {
                console.log(`Error: Invalid state variable name: ${variable}`);
            }
        }

        return false;
    }

    _substituteStateVar(clientId, variable)
    {
        if (variable.startsWith("@@"))
        {
            // Client-local variable
            if (clientId == null)
            {
                console.log(`Error: ClientId is null. Cannot read client-local variable: ${variable}`);
            }
            else
            {
                const flow = this._perClientFlow[clientId];
                if (!flow)
                {
                    console.log(`Error: No per-client game flow exists for clientId=${clientId}`);
                }
                else
                {
                    const name = variable.slice(2);
                    if (name.length > 0)
                    {
                        if (!(name in flow.state))
                        {
                            console.log(`Error: Cannot read missing client state variable for clientId=${clientId}: ${variable}`);
                        }
                        return flow.state[name];
                    }
                    else
                    {
                        console.log(`Error: Invalid state variable name: ${variable}`);
                    }
                }
            }
        }
        else if (variable.startsWith("@"))
        {
            // Global variable
            const name = variable.slice(1);
            if (name.length > 0)
            {
                if (!(name in this._globalFlow.state))
                {
                    console.log(`Error: Cannot read missing global state variable: ${variable}`);
                }
                return this._globalFlow.state[name];
            }
            else
            {
                console.log(`Error: Invalid state variable name: ${variable}`);
            }
        }
        else
        {
            return variable;
        }

        return null;
    }

    _do_init_state()
    {
        this._globalFlow.state = {};
        for (const [_, flow] of Object.entries(this._perClientFlow))
        {
            flow.state = {};
        }
        return true;
    }

    _do_client_ui(ui, clientId)
    {
        // Substitute variable if needed
        let param = ui.param ? this._substituteStateVar(clientId, ui.param) : null;

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
        const choice = action.choices[Math.floor(Math.random() * action.choices.length)];
        this._writeToStateVar(clientId, action.writeToStateVar, choice);
        return true;
    }

    _do_per_client(action)
    {
        // Set up new per-client flows
        for (const clientId of this._clientIds)
        {
            this._perClientFlow[clientId] = new GameFlowState(action.actions);
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
        const prompt = this._substituteStateVar(clientId, action.prompt);
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
            const variable = this._substituteStateVar(clientId, action.clientStateVar);
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
            const variable = this._substituteStateVar(clientId, action.clientStateVar);
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
        const selectedImageIds = this._substituteStateVar(clientId, action.fromStateVar);
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
        const votes = this._substituteStateVar(clientId, action.stateVar);
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
        this._globalFlow = new GameFlowState(actions);
        this._clientIds = clientIds;
    }
}

class Session
{
    _sessionId;
    _clientIds = new Set();     // set of clients
    _gameVoteByClientId = {};   // game selections, when this is not empty, voting is in progress
    _game;

    tryAddClientIfAccepting(clientId)
    {
        this._clientIds.add(clientId);
        //TODO: when we have state implemented, stop accepting clients after game selected
        return false;
    }

    removeClient(clientId)
    {
        this._clientIds.delete(clientId);
        delete this._gameVoteByClientId[clientId];
        //TODO: abort game if too few clients remaining?

        // If we are in game selection state, try tallying vote
        this._tryTallyGameVotes();
    }

    hasClient(clientId)
    {
        return this._clientIds.has(clientId);
    }

    voteForGame(clientId, gameName)
    {
        this._gameVoteByClientId[clientId] = gameName;
        this._tryTallyGameVotes();
    }

    receiveInputFromClient(clientId, inputs)
    {
        if (this._game)
        {
            this._game.receiveInputFromClient(clientId, inputs);
        }
    }

    receiveImageResponse(clientId, destStateVar, imageByUuid)
    {
        // Pass to game
        if (this._game)
        {
            this._game.receiveImageResponse(clientId, destStateVar, imageByUuid);
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

    _tryTallyGameVotes()
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
        switch (gameName)
        {
        default:
        case "It's a Mood":
            this._game = new Game(_themedImageGameFlow, this._clientIds);
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