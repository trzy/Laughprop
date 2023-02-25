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
        return HelloMessage.fromDictionary(dictionary);
    case "UnknownGameMessage":
        return UnknownGameMessage.fromDictionary(dictionary);
    case "ClientSnapshotMessage":
        return ClientSnapshotMessage.fromDictionary(dictionary);
    case "AuthoritativeStateMessage":
        return AuthoritativeStateMessage.fromDictionary(dictionary);
    }

    return null;
}

class HelloMessage
{
    __id = "HelloMessage";
    message;

    static fromDictionary(dictionary)
    {
        let msg = new HelloMessage(null);
        msg.message = dictionary["message"];
        return msg;
    }

    constructor(message)
    {
        if (!message)
        {
            return;
        }
        this.message = message;
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

    static fromDictionary(dictionary)
    {
        let msg = new UnknownGameMessage();
        msg.game_id = dictionary["game_id"];
        return msg;
    }
}

class ClientSnapshotMessage
{
    __id = "ClientSnapshotMessage";
    game_id;
    client_ids;

    static fromDictionary(dictionary)
    {
        let msg = new ClientSnapshotMessage();
        msg.game_id = dictionary["game_id"];
        msg.client_ids = dictionary["client_ids"];
        return msg;
    }
}

class AuthoritativeStateMessage
{
    __id = "AuthoritativeStateMessage";
    screen;
    state_params_json;

    get state_params()
    {
        return JSON.parse(this.state_params_json);
    }

    static fromDictionary(dictionary)
    {
        let msg = new AuthoritativeStateMessage(null);
        msg.screen = dictionary["screen"];
        msg.state_params_json = dictionary["state_params_json"];
        return msg;
    }

    constructor(screen, state_params_obj)
    {
        if (!screen)
        {
            return;
        }
        this.screen = screen;
        this.state_params_json = JSON.stringify(state_params_obj);
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
    AuthoritativeStateMessage
};