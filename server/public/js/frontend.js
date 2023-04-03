/*
 * frontend.js
 * Bart Trzynadlowski, 2023
 *
 * Main program module for game front end.
 */

import
{
    tryParseMessage,
    HelloMessage,
} from "./modules/messages.mjs";

var _socket = null;

function connectToBackend()
{
    let location = window.location;
    let wsUrl = "ws://" + location.hostname + ":" + location.port;

    console.log(`Connecting to backend socket: ${wsUrl}`)
    _socket = new WebSocket(wsUrl);

    _socket.onopen = function(event)
    {
        console.log("Connection established");
        sendMessage(new HelloMessage("Hello from Laughprop client"));
    };

    _socket.onmessage = function(event)
    {
        console.log(`Message received: ${event.data}`);

        let json;
        try
        {
            json = JSON.parse(event.data);
        }
        catch (error)
        {
            console.log(`Error: Unable to parse JSON message: ${event.data}`);
            return;
        }

        let msg = tryParseMessage(json);
        if (msg != null)
        {
            console.log(`Successfully decoded ${msg.__id}`);

            if (msg instanceof HelloMessage)
            {
                console.log(`Server says hello: ${msg.message}`);
            }
        }
        else
        {
            console.log("Error: Unable to decode message");
        }
    };

    _socket.onclose = function(event)
    {
        if (event.wasClean)
        {
            console.log(`Connection closed (code=${event.code}, reason=${event.reason})`);
        }
        else
        {
            console.log(`Connection died (code=${event.code}, reason=${event.reason})`);
        }
    };

    _socket.onerror = function(error)
    {
        console.log("Error: Socket error");
    };
}

function sendMessage(msg)
{
    if (_socket)
    {
        _socket.send(JSON.stringify(msg));
    }
    else
    {
        console.log("Error: Unable to send message because no connection exists:", msg);
    }
}

function main()
{
    console.log("Laughprop loaded");
    connectToBackend();
}

export { main };