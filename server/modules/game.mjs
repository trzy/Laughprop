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
 * game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Game state and script execution.
 */

import { ClientUIMessage } from "../../frontend/js/modules/messages.mjs";
import { randomChoice, tallyVotes } from "./utils.mjs";
import * as variable_expansion from "./variable_expansion.mjs";

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

    // Method to send message to a client: sendMessage(clientId, msg)
    _sendMessageToClientFn;

    // Image generator reference
    _imageGenerator;

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
            // Send to all clients
            for (const clientId of this._clientIds)
            {
                this._sendMessageToClientFn(clientId, msg);
            }
        }
        else
        {
            this._sendMessageToClientFn(clientId, msg);
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
        const params = this._expandStateVar(clientId, op.params);
        this._imageGenerator.makeTxt2ImgRequest(clientId, params, op.writeToStateVar);
        return true;
    }

    _do_depth2img(op, clientId)
    {
        const params = this._expandStateVar(clientId, op.params);
        this._imageGenerator.makeDepth2ImgRequest(clientId, params, op.writeToStateVar);
        return true;
    }

    _do_sketch2img(op, clientId)
    {
        const prompt = this._expandStateVar(clientId, op.prompt);
        const image = this._expandStateVar(clientId, op.image);
        this._imageGenerator.makeSketch2ImgRequest(clientId, prompt, image, op.writeToStateVar);
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

    constructor(ops, clientIds, sendMessageToClientFn, imageGenerator)
    {
        this._globalScriptCtx = new ScriptingContext(ops);
        this._clientIds = clientIds;
        this._sendMessageToClientFn = sendMessageToClientFn;
        this._imageGenerator = imageGenerator;
    }
}

export
{
    Game
}