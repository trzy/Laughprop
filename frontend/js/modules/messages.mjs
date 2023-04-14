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
    ReturnToLobbyMessage,
    SelectGameStateMessage,
    ChooseGameMessage,
    ClientUIMessage,
    ClientInputMessage
};