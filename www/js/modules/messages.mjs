/*
 * www/js/modules/messages.mjs
 * Bart Trzynadlowski, 2023
 *
 * JSON message objects for communication between web server and front end page. These must be kept
 * carefully in sync with their Python counterparts in python/networking/messages.py!
 */

class HelloMessage
{
    __id = "HelloMessage";
    message;

    constructor(message)
    {
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

export { HelloMessage, ClientIDMessage, ClientStateUpdateMessage, AuthoritativeStateUpdateMessage };