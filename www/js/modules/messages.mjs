/*
 * www/js/modules/messages.mjs
 * Bart Trzynadlowski, 2023
 *
 * JSON message objects for communication between web server and front end page. These must be kept
 * carefully in sync with their Python counterparts in python/networking/messages.py!
 */


function tryConstructMessageFromDictionary(dictionary)
{
    if (!("__id" in dictionary))
    {
        console.log("Error: Unable to construct message object because dictionary lacks __id field:", dictionary);
        return null;
    }

    switch (dictionary["__id"])
    {
    default:
        console.log("Error: Unable to construct message of type: " + dictionary["__id"]);
        break;
    case "HelloMessage":
        return new HelloMessage(dictionary);
    case "UnknownGameMessage":
        return new UnknownGameMessage(dictionary);
    case "ClientSnapshotMessage":
        return new ClientSnapshotMessage(dictionary);
    }

    return null;
}

class HelloMessage
{
    __id = "HelloMessage";
    message;

    constructor(message_or_dictionary)
    {
        if (typeof(message_or_dictionary) == "object")
        {
            this.message = message_or_dictionary["message"];
        }
        else if (typeof(message_or_dictionary) == "string")
        {
            this.message = message_or_dictionary;
        }
        else
        {
            this.message = null;
        }
    }
}

class ClientIDMessage
{
    __id = "ClientIDMessage";
    client_id;

    constructor(client_id)
    {
        this.client_id = client_id;
    }
}

class StartNewGameMessage
{
    __id = "StartNewGameMessage";
    game_id;

    constructor(game_id)
    {
        this.game_id = game_id;
    }
}

class JoinGameMessage
{
    __id = "JoinGameMessage";
    game_id;

    constructor(game_id)
    {
        this.game_id = game_id;
    }
}

class UnknownGameMessage
{
    __id = "UnknownGameMessage";
    game_id;

    constructor(dictionary)
    {
        this.game_id = dictionary["game_id"];
    }
}

class ClientSnapshotMessage
{
    __id = "ClientSnapshotMessage";
    game_id;
    client_ids;

    constructor(dictionary)
    {
        this.game_id = dictionary["game_id"];
        this.client_ids = dictionary["client_ids"];
    }
}

class ClientStateUpdateMessage
{
    __id = "ClientStateUpdateMessage";
    state_json;

    constructor(state_obj)
    {
        this.state_json = JSON.stringify(state_obj);
    }
}

class AuthoritativeStateUpdateMessage
{
    __id = "AuthoritativeStateUpdateMessage";
    state_json;

    get state()
    {
        return JSON.parse(this.state_json);
    }

    constructor(state_obj)
    {
        this.state_json = JSON.stringify(state_obj);
    }
}

export
{
    tryConstructMessageFromDictionary,
    HelloMessage,
    ClientIDMessage,
    StartNewGameMessage,
    JoinGameMessage,
    UnknownGameMessage,
    ClientSnapshotMessage,
    ClientStateUpdateMessage,
    AuthoritativeStateUpdateMessage
};