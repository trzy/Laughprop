/*
 * www/js/main.js
 * Bart Trzynadlowski, 2023
 *
 * Main program module for game front end.
 *
 * TODO:
 * -----
 * - On disconnect, return to WelcomeScreen and populate game ID field with old game ID, allowing
 *   users to optionally attempt to reconnect.
 */

import
{
    tryConstructMessageFromDictionary,
    HelloMessage,
    ClientIDMessage,
    StartNewGameMessage,
    JoinGameMessage,
    ClientSnapshotMessage,
    AuthoritativeStateMessage
} from "./modules/messages.mjs";
import { WelcomeScreen } from "./modules/screens/welcome.mjs";
import { SelectGameScreen } from "./modules/screens/select_game.mjs";
import { FunniestImageGameScreen } from "./modules/screens/funniest_image_game.mjs";
import { MovieGameScreen } from "./modules/screens/movie_game.mjs";

var g_socket = null;
var g_ourClientId = crypto.randomUUID();
var g_currentScreen = null;
var g_currentGameId = null;
var g_currentGameClientIds = [];

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
        sendMessage(new ClientIDMessage(g_ourClientId));
    };

    g_socket.onmessage = function(event)
    {
        console.log(`Message received: ${event.data}`);
        let msg = tryConstructMessageFromDictionary(JSON.parse(event.data));
        if (msg != null)
        {
            console.log(`Successfully decoded ${msg.__id}`);

            // Client snapshot messages are special: they tell us which game we are part of
            if (msg instanceof ClientSnapshotMessage)
            {
                if (!msg.client_ids.includes(g_ourClientId))
                {
                    console.log(`Error: Received ClientSnapshotMessage without our own client ID ${g_ourClientId} in it`);
                    return;
                }
                g_currentGameId = msg.game_id;
                g_currentGameClientIds = msg.client_ids;
            }

            // Authoritative state messages are special: they are used to create new screens if needed
            if (msg instanceof AuthoritativeStateMessage)
            {
                if (g_currentScreen == null || g_currentScreen.className != msg.screen)
                {
                    // Need to destroy current screen and create new one
                    g_currentScreen = createScreen(msg.screen);
                }
            }

            // Pass along to current UIScreen for handling
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

function createScreen(name)
{
    hideAllScreens();

    switch (name)
    {
    case SelectGameScreen.name:
        return new SelectGameScreen(g_ourClientId, g_currentGameId, g_currentGameClientIds, sendMessage);
    case FunniestImageGameScreen.name:
        return new FunniestImageGameScreen(g_ourClientId, g_currentGameId, g_currentGameClientIds, sendMessage);
    case MovieGameScreen.name:
        return new MovieGameScreen(g_ourClientId, g_currentGameId, g_currentGameClientIds, sendMessage);
    default:
        console.log("Error: Cannot instantiate unknown UI screen: " + name);
        return null;
    }
}

function hideAllScreens()
{
    $(".screen").each(function(index, element)
    {
        $(element).hide();
    });
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

function onNewGameSelected(gameId)
{
    // Ask server to start a new game and set our current game to this new ID
    g_currentGameId = gameId;
    sendMessage(new StartNewGameMessage(gameId));
}

function onJoinGameSelected(gameId)
{
    // Try to join existing game
    g_currentGameId = null;
    sendMessage(new JoinGameMessage(gameId));
}

function main()
{
    console.log("SDGame loaded");
    hideAllScreens();
    g_currentScreen = new WelcomeScreen(onNewGameSelected, onJoinGameSelected, sendMessage);
    connectToBackend();
}

export { main };