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

import http from "http";
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
} from "../frontend/js/modules/messages.mjs";
import { generateSessionId, randomChoice, tallyVotes } from "./modules/utils.mjs";
import * as variable_expansion from "./modules/variable_expansion.mjs";
import * as themed_image_game from "./modules/games/themed_image.mjs";
import * as movie_game from "./modules/games/movies.mjs";
import * as drawing_game from "./modules/games/drawing_game.mjs";


/**************************************************************************************************
 Session and Game State
**************************************************************************************************/

const _sessionById = {};

class ScriptingContext
{
    state = {};

    _ops;
    _opIdx = 0;

    getCurrentScriptOp()
    {
        return this._opIdx < this._ops.length ? this._ops[this._opIdx] : null;
    }

    goToNext()
    {
        if (this._opIdx < this._ops.length)
        {
            this._opIdx += 1;
        }
    }

    isFinished()
    {
        return this._opIdx >= this._ops.length;
    }

    constructor(ops)
    {
        this._ops = ops;
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
        // First, process per-client ops
        this._runNextPerClient();

        // Next, run global ops
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
            const op = scriptCtx.getCurrentScriptOp();
            canProceed = this._execute(op, clientId);
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

    _execute(op, clientId)
    {
        console.log(`-- Ctx=${!clientId ? "Global" : clientId} -- ${op.op}`);

        switch (op.op)
        {
        case "init_state":                      return this._do_init_state();
        case "client_ui":                       return this._do_client_ui(op.ui, clientId, op.sendToAll);
        case "random_choice":                   return this._do_random_choice(op, clientId);
        case "per_client":
            if (clientId != null)
            {
                console.log(`Error: per_client op cannot be nested further`);
                return true;
            }
            else
            {
                return this._do_per_client(op);
            }
        case "wait_for_state_var":              return this._do_wait_for_state_var(op, clientId);
        case "wait_for_state_var_all_users":    return this._do_wait_for_state_var_all_users(op);
        case "txt2img":                         return this._do_txt2img(op, clientId);
        case "depth2img":                       return this._do_depth2img(op, clientId);
        case "sketch2img":                      return this._do_sketch2img(op, clientId);
        case "gather_keys_into_array":          return this._do_gather_keys_into_array(op, clientId);
        case "gather_client_state_into_set":    return this._do_gather_client_state_into_set(op);
        case "gather_client_state_into_array":  return this._do_gather_client_state_into_array(op);
        case "gather_client_state_into_map_by_client_id":
                                                return this._do_gather_client_state_into_map_by_client_id(op);
        case "gather_images_into_map":          return this._do_gather_images_into_map(op, clientId);
        case "vote":                            return this._do_vote(op, clientId);
        case "select":                          return this._do_select(op, clientId);
        case "copy":                            return this._do_copy(op, clientId);
        case "delete":                          return this._do_delete(op, clientId);
        case "make_map":                        return this._do_make_map(op, clientId);
        case "random_client_input_output_mapping":
                                                return this._do_random_client_input_output_mapping(op, clientId);
        case "remap_keys":                      return this._do_remap_keys(op, clientId);
        case "get_our_client_id":               return this._do_get_our_client_id(op, clientId);
        case "invert_map":                      return this._do_invert_map(op, clientId);
        case "chain_maps":                      return this._do_chain_maps(op, clientId);
        default:
            console.log(`Error: Unknown op: ${op.op}`);
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

    _deleteStateVar(clientId, variable)
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
                delete localState[variable];
            }
            else
            {
                console.log(`Error: ClientId is null. Cannot delete client-local variable: ${variable}`);
            }
        }
        else if (variable.startsWith("@"))
        {
            delete globalState[variable];
        }
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

    _do_client_ui(ui, clientId, forceSendToAll)
    {
        console.log(ui.command + " -- " + forceSendToAll);
        // Substitute variable if needed
        let param = ui.param ? this._expandStateVar(clientId, ui.param) : null;

        // Send to client(s)
        const msg = new ClientUIMessage({ command: ui.command, param: param });
        if (clientId == null || forceSendToAll)
        {
            sendMessageToClients(this._clientIds, msg);
        }
        else
        {
            sendMessageToClient(clientId, msg);
        }

        return true;
    }

    _do_random_choice(op, clientId)
    {
        this._writeToStateVar(clientId, op.writeToStateVar, randomChoice(op.choices));
        return true;
    }

    _do_per_client(op)
    {
        // Set up new per-client scripting contexts
        for (const clientId of this._clientIds)
        {
            this._perClientScriptCtx[clientId] = new ScriptingContext(op.ops);
        }

        // Kick it off
        this._runNextPerClient();

        return true;
    }

    _do_wait_for_state_var(op, clientId)
    {
        return this._checkStateVarExists(clientId, op.stateVar);
    }

    _do_wait_for_state_var_all_users(op)
    {
        if (!op.stateVar.startsWith("@@"))
        {
            console.log(`Error: wait_for_state_var_all_users expected a per-client state variable but got: ${op.stateVar}`);
            return false;
        }

        let present = true;
        for (const clientId of this._clientIds)
        {
            present &= this._checkStateVarExists(clientId, op.stateVar);
        }
        return present;
    }

    _do_txt2img(op, clientId)
    {
        const prompt = this._expandStateVar(clientId, op.prompt);
        makeTxt2ImgRequest(clientId, prompt, op.writeToStateVar);
        return true;
    }

    _do_depth2img(op, clientId)
    {
        const params = this._expandStateVar(clientId, op.params);
        makeDepth2ImgRequest(clientId, params, op.writeToStateVar);
        return true;
    }

    _do_sketch2img(op, clientId)
    {
        const prompt = this._expandStateVar(clientId, op.prompt);
        const image = this._expandStateVar(clientId, op.image);
        makeSketch2ImgRequest(clientId, prompt, image, op.writeToStateVar);
        return true;
    }

    _do_gather_keys_into_array(op, clientId)
    {
        let array = [];
        const srcMap = this._expandStateVar(clientId, op.stateVar);
        if (srcMap.constructor === Object)
        {
            array = Object.keys(srcMap);
        }
        else
        {
            console.log(`Error: gather_keys_into_array expected a map but got: ${op.stateVar}`);
        }
        this._writeToStateVar(clientId, op.writeToStateVar, array);
        return true;
    }

    _do_gather_client_state_into_set(op)
    {
        if (!op.clientStateVar.startsWith("@@"))
        {
            console.log(`Error: gather_client_state_into_set expected a per-client state variable but got: ${op.clientStateVar}`);
            return false;
        }

        const aggregated = new Set();
        for (const clientId of this._clientIds)
        {
            const variable = this._expandStateVar(clientId, op.clientStateVar);
            if (variable)
            {
                aggregated.add(variable);
            }
        }

        this._writeToStateVar(null, op.writeToStateVar, aggregated);

        return true;
    }

    _do_gather_client_state_into_array(op)
    {
        if (!op.clientStateVar.startsWith("@@"))
        {
            console.log(`Error: gather_client_state_into_array expected a per-client state variable but got: ${op.clientStateVar}`);
            return false;
        }

        const aggregated = [];
        for (const clientId of this._clientIds)
        {
            const variable = this._expandStateVar(clientId, op.clientStateVar);
            if (variable)
            {
                aggregated.push(variable);
            }
        }

        this._writeToStateVar(null, op.writeToStateVar, aggregated);

        return true;
    }

    _do_gather_client_state_into_map_by_client_id(op)
    {
        if (!op.clientStateVar.startsWith("@@"))
        {
            console.log(`Error: gather_client_state_into_map_by_client_id expected a per-client state variable but got: ${op.clientStateVar}`);
            return false;
        }

        const aggregated = {};
        for (const clientId of this._clientIds)
        {
            const variable = this._expandStateVar(clientId, op.clientStateVar);
            if (variable)
            {
                aggregated[clientId] = variable;
            }
        }

        this._writeToStateVar(null, op.writeToStateVar, aggregated);

        return true;
    }

    _do_gather_images_into_map(op, clientId)
    {
        const selectedImageIds = this._expandStateVar(clientId, op.fromStateVar);
        if (!selectedImageIds)
        {
            console.log(`Error: gather_images_into_map was unable to read from ${op.fromStateVar}`);
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

        this._writeToStateVar(clientId, op.writeToStateVar, aggregated);

        return true;
    }

    _do_vote(op, clientId)
    {
        const votes = this._expandStateVar(clientId, op.stateVar);
        if (!votes || !(votes.length > 0))
        {
            console.log(`Error: Unable to vote on null or empty vote array read from ${op.stateVar}`);
            return false;
        }

        const winningVotes = tallyVotes(votes);
        this._writeToStateVar(clientId, op.writeToStateVar, winningVotes);

        return true;
    }

    _do_select(op, clientId)
    {
        const selection = this._expandStateVar(clientId, op.stateVar);
        const selections = this._expandStateVar(clientId, op.selections);
        const selectedValue = selections[selection];
         this._writeToStateVar(clientId, op.writeToStateVar, selectedValue);
        return true;
    }

    _do_copy(op, clientId)
    {
        const src = this._expandStateVar(clientId, op.source);
        this._writeToStateVar(clientId, op.writeToStateVar, src);
        return true;
    }

    _do_delete(op, clientId)
    {
        this._deleteStateVar(clientId, op.stateVar);
        return true;
    }

    _do_make_map(op, clientId)
    {
        const map = {};
        const keys = this._expandStateVar(clientId, op.keys);
        const values = this._expandStateVar(clientId, op.values);

        if (!keys || !values || keys.constructor != Array || values.constructor != Array)
        {
            console.log(`Error: make_map expects keys and values to be arrays`);
        }
        else if (keys.length != values.length)
        {
            console.log(`Error: make_map expects keys and values to be same length`);
        }
        else
        {
            for (let i = 0; i < keys.length; i++)
            {
                map[keys[i]] = values[i];
            }
        }

        this._writeToStateVar(clientId, op.writeToStateVar, map);

        return true;
    }

    _do_random_client_input_output_mapping(op, clientId)
    {
        // The simplest way to establish a unique mapping is to assign each client (input) to the
        // *next* client (output), wrapping around for the last one
        const clientIds = Array.from(this._clientIds);
        const inOut = {};
        for (let i = 0; i < clientIds.length; i++)
        {
            const inputClient = clientIds[i];
            const outIdx = (i + 1) % clientIds.length;
            const outputClient = clientIds[outIdx];
            inOut[inputClient] = outputClient;
        }

        this._writeToStateVar(clientId, op.writeToStateVar, inOut);
        return true;
    }

    _do_remap_keys(op, clientId)
    {
        // Given a map of (key1 -> value), and other map of (key1 -> key2), returns a map of
        // (key2 -> value). It is up to the user to ensure the mapping is unique.
        const mapOut = {};
        const mapIn = this._expandStateVar(clientId, op.stateVar);
        const newKeyMap = this._expandStateVar(clientId, op.keyMapStateVar);
        for (const [key1, value] of Object.entries(mapIn))
        {
            const key2 = newKeyMap[key1];
            if (key2)
            {
                mapOut[key2] = value;
            }
        }
        this._writeToStateVar(clientId, op.writeToStateVar, mapOut);
        return true;
    }

    _do_get_our_client_id(op, clientId)
    {
        this._writeToStateVar(clientId, op.writeToStateVar, clientId);
        return true;
    }

    _do_invert_map(op, clientId)
    {
        // Given a map of (x -> f) produces (f -> x). This requires that there
        // are no duplicate values.
        const mapOut = {};
        const mapIn = this._expandStateVar(clientId, op.stateVar);

        // Validate
        if (Object.keys(mapIn).length != (new Set(Object.values(mapIn))).size)
        {
            console.log(`Error: Cannot safely invert map ${op.stateVar} because mapping of keys to values is not unique: ${mapIn}`);
        }

        // Invert
        for (const [key, value] of Object.entries(mapIn))
        {
            mapOut[value] = key;
        }

        this._writeToStateVar(clientId, op.writeToStateVar, mapOut);
        return true;
    }

    _do_chain_maps(op, clientId)
    {
        // Given maps (key1 -> value1) and (value1 -> value2), produces (key1 -> value2).
        const mapOut = {};
        const map1 = this._expandStateVar(clientId, op.keyMapVar);
        const map2 = this._expandStateVar(clientId, op.valueMapVar);

        // Compose -- or chain -- the two maps
        for (const [key1, value1] of Object.entries(map1))
        {
            if (map2[value1])
            {
                const value2 = map2[value1];
                mapOut[key1] = value2;
            }
            else
            {
                console.log(`Error: Cannot chain maps ${op.keyMapVar} and ${op.valueMapVar} because the latter lacks a required key: ${value1}`);
            }
        }

        this._writeToStateVar(clientId, op.writeToStateVar, mapOut);
        return true;
    }

    constructor(ops, clientIds)
    {
        this._globalScriptCtx = new ScriptingContext(ops);
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
        case "I'd Watch That":
            this._game = new Game(movie_game.script, this._clientIds);
            this._game.start();
            break;
        case "Drawing Game":
            this._game = new Game(drawing_game.script, this._clientIds);
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

const _imageServerParams = {
    host: "127.0.0.1",
    port: 7860,
    txt2ImgModel: "v1-5-pruned-emaonly.safetensors",
    depth2ImgModel: "512-depth-ema.ckpt"
};

var _placeholderImages = [];
var _inputImageByAssetPath = {};

function loadInputImage(assetPath)
{
    if (assetPath in _inputImageByAssetPath)
    {
        return _inputImageByAssetPath[assetPath];
    }

    const filepath = "../assets/" + assetPath;
    const buffer = fs.readFileSync(filepath);
    const base64 = buffer.toString("base64");
    _inputImageByAssetPath[assetPath] = base64;
    return base64;
}

function getImageServerOptions(onOptions)
{
    const url = "http://" + _imageServerParams.host + ":" + _imageServerParams.port + "/sdapi/v1/options";
    http.get(url, response =>
    {
        response.on("data", data =>
        {
            try
            {
                onOptions(JSON.parse(data));
            }
            catch (error)
            {
                console.log("Error: Unable to parse image server options");
                onOptions({});
            }
        });
    }).on("error", error =>
    {
        console.log("Error: Image server options read request failed");
        console.log(error);
        onOptions({});
    });
}

function setImageModel(model)
{
    console.log(`Setting image model: ${model}`);

    const options = {
        "sd_model_checkpoint": model
    };

    // Post
    const urlParams = {
        host: _imageServerParams.host,
        port: _imageServerParams.port,
        path: "/sdapi/v1/options",
        method: "POST",
        headers: { "Content-Type": "application/json" }
    };

    const request = http.request(urlParams);
    request.on("error", error =>
    {
        console.log(`Error: Model set request failed`);
        console.log(error);
    });

    request.write(JSON.stringify(options));
    request.end();
}

function makeTxt2ImgRequest(clientId, prompt, destStateVar)
{
    const session = tryGetSessionByClientId(clientId);
    if (!session)
    {
        console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
        return;
    }

    getImageServerOptions(options =>
    {
        const model = options["sd_model_checkpoint"];
        if (_imageServerParams.txt2ImgModel != model)
        {
            setImageModel(_imageServerParams.txt2ImgModel);
        }
        continueTxt2ImgRequest(clientId, prompt, session, destStateVar);
    });
}

function continueTxt2ImgRequest(clientId, prompt, session, destStateVar)
{
    // Defaults
    const payload = {
        "enable_hr": false,
        "hr_scale" : 2,
        "hr_upscaler" : "Latent",
        "hr_second_pass_steps" : 0,
        "hr_resize_x": 0,
        "hr_resize_y": 0,
        "denoising_strength": 0.0,
        "firstphase_width": 0,
        "firstphase_height": 0,
        "prompt": "",
        "styles": [],
        "seed": -1,
        "subseed": -1,
        "subseed_strength": 0.0,
        "seed_resize_from_h": -1,
        "seed_resize_from_w": -1,
        "batch_size": 1,
        "n_iter": 1,
        "steps": 20,
        "cfg_scale": 7.0,
        "width": 512,
        "height": 512,
        "restore_faces": false,
        "tiling": false,
        "negative_prompt": "",
        "eta": 0,
        "s_churn": 0,
        "s_tmax": 0,
        "s_tmin": 0,
        "s_noise": 1,
        "override_settings": {},
        "override_settings_restore_afterwards": true,
        "sampler_name": "Euler a",
        "sampler_index": "Euler a",
        "script_name": null,
        "script_args": []
    };

    // Our params
    payload["prompt"] = prompt;
    payload["seed"] = 42;
    payload["cfg_scale"] = 9;   // 7?
    payload["steps"] = 40;
    payload["batch_size"] = 4;

    // Post request
    const urlParams = {
        host: _imageServerParams.host,
        port: _imageServerParams.port,
        path: "/sdapi/v1/txt2img",
        method: "POST",
        headers: { "Content-Type": "application/json" }
    };

    function dummyResponse()
    {
        // Use placeholder images
        const imageByUuid = {};
        const numImagesExpected = payload["batch_size"] * payload["n_iter"];
        for (let i = 0; i < numImagesExpected; i++)
        {
            imageByUuid[crypto.randomUUID()] = randomChoice(_placeholderImages);
        }
        session.receiveImageResponse(clientId, destStateVar, imageByUuid);
    }

    function onResponse(response)
    {
        let data = "";
        response.on("data", (chunk) =>
        {
            data += chunk;
        });
        response.on("end", () =>
        {
            try
            {
                const responseObj = JSON.parse(data);
                if (!responseObj["images"])
                {
                    console.log("Error: Did not receive any images");
                    dummyResponse();
                }
                else
                {
                    const numImagesExpected = payload["batch_size"] * payload["n_iter"];
                    const numImages = Math.min(responseObj["images"].length, numImagesExpected);
                    const imageByUuid = {};

                    for (let i = 0; i < numImages; i++)
                    {
                        imageByUuid[crypto.randomUUID()] = responseObj["images"][i];
                    }

                    // This should never happen but in case it does, pad with the first image
                    for (let i = numImages; i < numImagesExpected; i++)
                    {
                        imageByUuid[crypto.randomUUID()] = responseObj["images"][0];
                    }

                    // Return
                    session.receiveImageResponse(clientId, destStateVar, imageByUuid);
                }
            }
            catch (error)
            {
                console.log("Error: Unable to parse response from image server");
                dummyResponse();
            }
        });
    }

    const request = http.request(urlParams, onResponse);
    request.on("error", error =>
    {
        console.log(`Error: txt2img request failed`);
        console.log(error);
        dummyResponse();
    });
    request.write(JSON.stringify(payload));
    request.end();
}

function makeDepth2ImgRequest(clientId, params, destStateVar)
{
    const session = tryGetSessionByClientId(clientId);
    if (!session)
    {
        console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
        return;
    }

    getImageServerOptions(options =>
    {
        const model = options["sd_model_checkpoint"];
        if (_imageServerParams.depth2ImgModel != model)
        {
            setImageModel(_imageServerParams.depth2ImgModel);
        }
        continueDepth2ImgRequest(clientId, params, session, destStateVar);
    });
}

function continueDepth2ImgRequest(clientId, params, session, destStateVar)
{
    // Defaults
    const payload = {
        "init_images": [ loadInputImage(params.image) ],
        "resize_mode": 0,
        "denoising_strength": 0.75,
        "mask_blur": 4,
        "inpainting_fill": 0,
        "inpaint_full_res": true,
        "inpaint_full_res_padding": 0,
        "inpainting_mask_invert": 0,
        "initial_noise_multiplier": 1,
        "prompt": "",
        "styles": [],
        "seed": -1,
        "subseed": -1,
        "subseed_strength": 0,
        "seed_resize_from_h": -1,
        "seed_resize_from_w": -1,
        "batch_size": 1,
        "n_iter": 1,
        "steps": 20,
        "cfg_scale": 7.0,
        "image_cfg_scale": 1.5,
        "width": 512,
        "height": 512,
        "restore_faces": false,
        "tiling": false,
        "negative_prompt": "",
        "eta": 0,
        "s_churn": 0,
        "s_tmax": 0,
        "s_tmin": 0,
        "s_noise": 1,
        "override_settings": {},
        "override_settings_restore_afterwards": true,
        "sampler_name": "Euler a",
        "sampler_index": "Euler a",
        "include_init_images": false,
        "script_name": null,
        "script_args": []
    };

    // Our params
    payload["prompt"] = params.prompt;
    payload["negative_prompt"] = params.negative_prompt;
    payload["seed"] = 585501288;
    payload["cfg_scale"] = 9;
    payload["denoising_strength"] = 0.9;
    payload["steps"] = 50;
    payload["batch_size"] = 1;
    payload["n_iter"] = 4;             // generate 4 images sequentially, which seems to yield more diverse results (https://github.com/CompVis/stable-diffusion/issues/218)
    payload["sampler_name"] = "DDIM",
    payload["sampler_index"] = "DDIM";  // this parameter is deprecated, supposedly
    payload["seed_resize_from_h"] = 0;
    payload["seed_resize_from_w"] = 0;
    payload["resize_mode"] = 0;

    // Post request
    const urlParams = {
        host: "127.0.0.1",
        port: 7860,
        path: "/sdapi/v1/img2img",
        method: "POST",
        headers: { "Content-Type": "application/json" }
    };

    function dummyResponse()
    {
        // Use placeholder images
        const imageByUuid = {};
        const numImagesExpected = payload["batch_size"] * payload["n_iter"];
        for (let i = 0; i < numImagesExpected; i++)
        {
            imageByUuid[crypto.randomUUID()] = randomChoice(_placeholderImages);
        }
        session.receiveImageResponse(clientId, destStateVar, imageByUuid);
    }

    function onResponse(response)
    {
        let data = "";
        response.on("data", (chunk) =>
        {
            data += chunk;
        });
        response.on("end", () =>
        {
            try
            {
                const responseObj = JSON.parse(data);
                if (!responseObj["images"])
                {
                    console.log("Error: Did not receive any images");
                    dummyResponse();
                }
                else
                {
                    const numImagesExpected = payload["batch_size"] * payload["n_iter"];
                    const numImages = Math.min(responseObj["images"].length, numImagesExpected);
                    const imageByUuid = {};

                    for (let i = 0; i < numImages; i++)
                    {
                        imageByUuid[crypto.randomUUID()] = responseObj["images"][i];
                    }

                    // This should never happen but in case it does, pad with the first image
                    for (let i = numImages; i < numImagesExpected; i++)
                    {
                        imageByUuid[crypto.randomUUID()] = responseObj["images"][0];
                    }

                    // Return
                    session.receiveImageResponse(clientId, destStateVar, imageByUuid);
                }
            }
            catch (error)
            {
                console.log("Error: Unable to parse response from image server");
                dummyResponse();
            }
        });
    }

    const request = http.request(urlParams, onResponse);
    request.on("error", error =>
    {
        console.log(`Error: depth2img request failed`);
        console.log(error);
        dummyResponse();
    });
    request.write(JSON.stringify(payload));
    request.end();
}

function makeSketch2ImgRequest(clientId, prompt, inputImageBase64, destStateVar)
{
    const session = tryGetSessionByClientId(clientId);
    if (!session)
    {
        console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
        return;
    }

    getImageServerOptions(options =>
    {
        const model = options["sd_model_checkpoint"];
        if (_imageServerParams.txt2ImgModel != model)
        {
            setImageModel(_imageServerParams.txt2ImgModel);
        }
        continueSketch2ImgRequest(clientId, prompt, inputImageBase64, session, destStateVar);
    });
}

// Sketch2img is text2img/img2img plus ControlNet scribble mode
function continueSketch2ImgRequest(clientId, prompt, inputImageBase64, session, destStateVar)
{

    // Defaults
    const payload = {
        "enable_hr": false,
        "hr_scale" : 2,
        "hr_upscaler" : "Latent",
        "hr_second_pass_steps" : 0,
        "hr_resize_x": 0,
        "hr_resize_y": 0,
        "denoising_strength": 0.0,
        "firstphase_width": 0,
        "firstphase_height": 0,
        "prompt": "",
        "styles": [],
        "seed": -1,
        "subseed": -1,
        "subseed_strength": 0.0,
        "seed_resize_from_h": -1,
        "seed_resize_from_w": -1,
        "batch_size": 1,
        "n_iter": 1,
        "steps": 20,
        "cfg_scale": 7.0,
        "width": 512,
        "height": 512,
        "restore_faces": false,
        "tiling": false,
        "negative_prompt": "",
        "eta": 0,
        "s_churn": 0,
        "s_tmax": 0,
        "s_tmin": 0,
        "s_noise": 1,
        "override_settings": {},
        "override_settings_restore_afterwards": true,
        "sampler_name": "Euler a",
        "sampler_index": "Euler a",
        "script_name": null,
        "script_args": []
    };

    // Our params
    payload["prompt"] = prompt;
    payload["seed"] = 42;
    payload["cfg_scale"] = 9;   // 7?
    payload["steps"] = 40;
    payload["batch_size"] = 4;
    payload["init_images"] = [ inputImageBase64 ];

    // ControlNet stuff
    payload["alwayson_scripts"] = {
        "controlnet": {
            "args": [
                {
                    "input_image": inputImageBase64,
                    "mask": "",
                    "module": "invert (from white bg & black line)",    // images submitted as white background and black lines, need to invert them
                    "model": "control_v11p_sd15_scribble [d4ba51ff]",
                    "weight": 1.0,
                    "processor_res": 512,
                    "resize_mode": "Scale to Fit (Inner Fit)",
                    "lowvram": false,
                    "threshold_a": 0.0,
					"threshold_b": 255.0,
					"guidance": 1.0,
					"guidance_start": 0.0,
					"guidance_end": 1.0,
					//"guessmode": false
                },
            ]
        }
    };

    // Post request
    const urlParams = {
        host: _imageServerParams.host,
        port: _imageServerParams.port,
        path: "/sdapi/v1/txt2img",
        method: "POST",
        headers: { "Content-Type": "application/json" }
    };

    function dummyResponse()
    {
        // Use placeholder images
        const imageByUuid = {};
        const numImagesExpected = payload["batch_size"] * payload["n_iter"];
        for (let i = 0; i < numImagesExpected; i++)
        {
            imageByUuid[crypto.randomUUID()] = randomChoice(_placeholderImages);
        }
        session.receiveImageResponse(clientId, destStateVar, imageByUuid);
    }

    function onResponse(response)
    {
        let data = "";
        response.on("data", (chunk) =>
        {
            data += chunk;
        });
        response.on("end", () =>
        {
            try
            {
                const responseObj = JSON.parse(data);
                if (!responseObj["images"])
                {
                    console.log("Error: Did not receive any images");
                    dummyResponse();
                }
                else
                {
                    const numImagesExpected = payload["batch_size"] * payload["n_iter"];
                    const numImages = Math.min(responseObj["images"].length, numImagesExpected);
                    const imageByUuid = {};

                    for (let i = 0; i < numImages; i++)
                    {
                        imageByUuid[crypto.randomUUID()] = responseObj["images"][i];
                    }

                    // This should never happen but in case it does, pad with the first image
                    for (let i = numImages; i < numImagesExpected; i++)
                    {
                        imageByUuid[crypto.randomUUID()] = responseObj["images"][0];
                    }

                    // Return
                    session.receiveImageResponse(clientId, destStateVar, imageByUuid);
                }
            }
            catch (error)
            {
                console.log("Error: Unable to parse response from image server");
                dummyResponse();
            }
        });
    }

    const request = http.request(urlParams, onResponse);
    request.on("error", error =>
    {
        console.log(`Error: sketch2img request failed`);
        console.log(error);
        dummyResponse();
    });
    request.write(JSON.stringify(payload));
    request.end();
}

function loadRequiredImageAssets()
{
    const filepaths = [ "../assets/RickAstley.jpg", "../assets/Plissken2.jpg", "../assets/KermitPlissken.jpg", "../assets/SpaceFarley.jpg" ];
    _placeholderImages = [];
    for (const filepath of filepaths)
    {
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString("base64");
        _placeholderImages.push(base64);
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

loadRequiredImageAssets();

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