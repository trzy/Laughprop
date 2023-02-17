/*
 * www/js/main.js
 * Bart Trzynadlowski, 2023
 *
 * Main program module for game front end.
 */

import { HelloMessage, ClientIDMessage, AuthoritativeStateUpdateMessage } from "./modules/messages.mjs";

var g_socket = null;
var g_clientID = crypto.randomUUID();

function connect_to_backend()
{
    var location = window.location;
    var wsUrl = "ws://" + location.hostname + ":" + location.port + "/ws";

    console.log(`Connecting to backend socket: ${wsUrl}`)
    g_socket = new WebSocket(wsUrl);

    g_socket.onopen = function(event)
    {
        console.log("Connection established");
        g_socket.send(JSON.stringify(new HelloMessage("Hello from client")));
        g_socket.send(JSON.stringify(new ClientIDMessage(g_clientID)));
    };

    g_socket.onmessage = function(event)
    {
        console.log(`Data received: ${event.data}`);
    };

    g_socket.onclose = function(event)
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

    g_socket.onerror = function(error)
    {
        console.log("Error: Socket error");
    };
}

function main()
{
    console.log("SDGame loaded");
    connect_to_backend();
}

export { main };