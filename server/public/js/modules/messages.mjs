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
    case "ClientIDMessage":
        return Object.assign(new ClientIdMessage(), json);
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
};

class ClientIdMessage
{
    __id = "ClientIDMessage";
    client_id;

    constructor(client_id)
    {
        this.client_id = client_id;
    }
};

export
{
    tryParseMessage,
    HelloMessage,
    ClientIdMessage
};