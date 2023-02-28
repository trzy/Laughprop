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
    case "PeerStateMessage":
        return PeerStateMessage.fromDictionary(dictionary);
    case "ImageResponseMessage":
        return ImageResponseMessage.fromDictionary(dictionary);
    case "CachedImagesMessage":
        return CachedImagesMessage.fromDictionary(dictionary);
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
    state_json;

    get state()
    {
        return JSON.parse(this.state_json);
    }

    static fromDictionary(dictionary)
    {
        let msg = new AuthoritativeStateMessage(null);
        msg.screen = dictionary["screen"];
        msg.state_json = dictionary["state_json"];
        return msg;
    }

    constructor(screen, state_obj)
    {
        if (!screen)
        {
            return;
        }
        this.screen = screen;
        this.state_json = JSON.stringify(state_obj);
    }
}

class PeerStateMessage
{
    __id = "PeerStateMessage";
    from_client_id;
    screen;
    state_json;

    get state()
    {
        return JSON.parse(this.state_json);
    }

    static fromDictionary(dictionary)
    {
        let msg = new PeerStateMessage(null);
        msg.from_client_id = dictionary["from_client_id"];
        msg.screen = dictionary["screen"];
        msg.state_json = dictionary["state_json"];
        return msg;
    }

    constructor(from_client_id, screen, state_obj)
    {
        if (!from_client_id)
        {
            return;
        }
        this.from_client_id = from_client_id;
        this.screen = screen;
        this.state_json = JSON.stringify(state_obj);
    }
}

class Txt2ImgRequestMessage
{
    __id = "Txt2ImgRequestMessage";
    prompt;
    request_id;

    constructor(prompt, request_id)
    {
        this.prompt = prompt;
        this.request_id = request_id;
    }
}

class ImageResponseMessage
{
    __id = "ImageResponseMessage"
    request_id;
    images;

    static fromDictionary(dictionary)
    {
        return new ImageResponseMessage(dictionary["request_id"], dictionary["images"]);
    }

    constructor(request_id, images)
    {
        this.request_id = request_id;
        this.images = images;
    }
}

class RequestCachedImagesMessage
{
    __id = "RequestCachedImagesMessage";
    request_ids = [];
    idxs = [];
}

class CachedImagesMessage
{
    __id = "CachedImagesMessage";
    client_ids = [];
    request_ids = [];
    idxs = [];
    images = [];

    static fromDictionary(dictionary)
    {
        return new CachedImagesMessage(dictionary["client_ids"], dictionary["request_ids"], dictionary["idxs"], dictionary["images"])
    }

    constructor(client_ids, request_ids, idxs, images)
    {
        this.client_ids = client_ids;
        this.request_ids = request_ids;
        this.idxs = idxs;
        this.images = images;
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
    AuthoritativeStateMessage,
    PeerStateMessage,
    Txt2ImgRequestMessage,
    ImageResponseMessage,
    RequestCachedImagesMessage,
    CachedImagesMessage
};