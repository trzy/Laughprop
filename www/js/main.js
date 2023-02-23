/*
 * www/js/main.js
 * Bart Trzynadlowski, 2023
 *
 * Main program module for game front end.
 */

import { tryConstructMessageFromDictionary, HelloMessage, ClientIDMessage, StartNewGameMessage, JoinGameMessage } from "./modules/messages.mjs";
import { WelcomeScreen } from "./modules/screens/welcome.mjs";

var g_socket = null;
var g_clientId = crypto.randomUUID();
var g_currentScreen = null;
var g_currentGameId = null;

function connectToBackend()
{
    let location = window.location;
    let wsUrl = "ws://" + location.hostname + ":" + location.port + "/ws";

    console.log(`Connecting to backend socket: ${wsUrl}`)
    g_socket = new WebSocket(wsUrl);

    g_socket.onopen = function(event)
    {
        console.log("Connection established");
        sendMessage(new HelloMessage("Hello from client"));
        sendMessage(new ClientIDMessage(g_clientId));
    };

    g_socket.onmessage = function(event)
    {
        console.log(`Message received: ${event.data}`);
        let msg = tryConstructMessageFromDictionary(JSON.parse(event.data));
        if (msg != null)
        {
            // Pass to current UIScreen for handling
            console.log(`Successfully decoded ${msg.__id}`);
            if (g_currentScreen != null)
            {
                g_currentScreen.onMessageReceived(msg);
            }
        }
        else
        {
            console.log("Unable to decode message");
        }
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

function sendMessage(msg)
{
    if (g_socket)
    {
        g_socket.send(JSON.stringify(msg));
    }
    else
    {
        console.log("Error: Unable to send message because no connection exists:", msg);
    }
}

function onNewGame(gameId)
{
    // Ask server to start a new game and set our current game to this new ID
    g_currentGameId = gameId;
    sendMessage(new StartNewGameMessage(gameId));
}

function onJoinGame(gameId)
{
    // Try to join existing game
    g_currentGameId = null;
    sendMessage(new JoinGameMessage(gameId));
}

function main()
{
    console.log("SDGame loaded");
    g_currentScreen = new WelcomeScreen(onNewGame, onJoinGame);
    connectToBackend();
}

export { main };