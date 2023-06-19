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
 * messages.mjs
 * Bart Trzynadlowski, 2023
 *
 * Defines messages for communication between client and server.
 */

function tryParseMessage(json)
{
    if (!("__id" in json))
    {
        return null;
    }

    switch (json.__id)
    {
    default:
        return null;
    case "HelloMessage":
        return Object.assign(new HelloMessage(), json);
    case "StartNewGameMessage":
        return Object.assign(new StartNewGameMessage(), json);
    case "JoinGameMessage":
        return Object.assign(new JoinGameMessage(), json);
    case "LeaveGameMessage":
        return Object.assign(new LeaveGameMessage(), json);
    case "GameStartingStateMessage":
        return Object.assign(new GameStartingStateMessage(), json);
    case "FailedToJoinMessage":
        return Object.assign(new FailedToJoinMessage(), json);
    case "RejoinGameMessage":
        return Object.assign(new RejoinGameMessage(), json);
    case "ReturnToLobbyMessage":
        return Object.assign(new ReturnToLobbyMessage(), json);
    case "SelectGameStateMessage":
        return Object.assign(new SelectGameStateMessage(), json);
    case "ChooseGameMessage":
        return Object.assign(new ChooseGameMessage(), json);
    case "ClientUIMessage":
        return Object.assign(new ClientUIMessage(), json);
    case "ClientInputMessage":
        return Object.assign(new ClientInputMessage(), json);
    }
}

class HelloMessage
{
    __id = "HelloMessage";
    message;

    constructor(message)
    {
        this.message = message;
    }
}

class StartNewGameMessage
{
    __id = "StartNewGameMessage";
    clientId;

    constructor(clientId)
    {
        this.clientId = clientId;
    }
}

class JoinGameMessage
{
    __id = "JoinGameMessage";
    sessionId;
    clientId;

    constructor(sessionId, clientId)
    {
        this.sessionId = sessionId;
        this.clientId = clientId;
    }
}

class LeaveGameMessage
{
    __id = "LeaveGameMessage";
}

class GameStartingStateMessage
{
    __id = "GameStartingStateMessage";
    sessionId;

    constructor(sessionId)
    {
        this.sessionId = sessionId;
    }
}

class FailedToJoinMessage
{
    __id = "FailedToJoinMessage";
    reason;

    constructor(reason)
    {
        this.reason = reason;
    }
}

class RejoinGameMessage
{
    __id = "RejoinGameMessage";
    sessionId;
    clientId;

    constructor(sessionId, clientId)
    {
        this.sessionId = sessionId;
        this.clientId = clientId;
    }
}

class ReturnToLobbyMessage
{
    __id = "ReturnToLobbyMessage";
    gameInterruptedReason;

    // gameInterruptedReason may be null, indicating normal termination
    constructor(reason)
    {
        this.gameInterruptedReason = reason;
    }
}

class SelectGameStateMessage
{
    __id = "SelectGameStateMessage";
    sessionId;

    constructor(sessionId)
    {
        this.sessionId = sessionId;
    }
}

class ChooseGameMessage
{
    __id = "ChooseGameMessage";
    gameName;

    constructor(gameName)
    {
        this.gameName = gameName;
    }
}

class ClientUIMessage
{
    __id = "ClientUIMessage";
    command;

    constructor(command)
    {
        this.command = command;
    }
}

class ClientInputMessage
{
    __id = "ClientInputMessage";
    inputs;     // dictionary of (stateVarName, value) pairs

    constructor(inputs)
    {
        this.inputs = inputs;
    }
}

export
{
    tryParseMessage,
    HelloMessage,
    StartNewGameMessage,
    JoinGameMessage,
    LeaveGameMessage,
    GameStartingStateMessage,
    FailedToJoinMessage,
    RejoinGameMessage,
    ReturnToLobbyMessage,
    SelectGameStateMessage,
    ChooseGameMessage,
    ClientUIMessage,
    ClientInputMessage
};