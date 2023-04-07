/*
 * frontend.js
 * Bart Trzynadlowski, 2023
 *
 * Main program module for game front end.
 */

import { generateUuid } from "./modules/utils.mjs";
import
{
    tryParseMessage,
    HelloMessage,
    StartNewGameMessage,
    JoinGameMessage,
    GameStartingStateMessage,
    FailedToJoinMessage,
    SelectGameStateMessage
} from "./modules/messages.mjs";


/**************************************************************************************************
 Connection Management
**************************************************************************************************/

var _socket = null;
var _clientId = generateUuid();

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

            handleMessageFromServer(msg);
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


/**************************************************************************************************
 Welcome Screen

 Host or connect to a game.
**************************************************************************************************/

function hideAllScreens()
{
    $(".screen").each(function(index, element)
    {
        $(element).hide();
    });
}

function onNewGameButtonClicked()
{
    sendMessage(new StartNewGameMessage(_clientId));
}

function onJoinGameButtonClicked()
{
    const sessionId = $("#GameID").val();
    sendMessage(new JoinGameMessage(sessionId, _clientId));
    console.log("got here");
}

function onGameStartingState(msg)
{
    $(".message").each(function(index, element)
    {
        $(element).hide();
    });
    $("#StartingNewGameMessage").show();
    $("#WelcomeScreen #Buttons").hide();
    $("#GameID").val(msg.sessionId);

}

function onFailedToJoinState()
{
    $(".message").each(function(index, element)
    {
        $(element).hide();
    });
    $("#FailedToJoinGameMessage").show();
}

function onGameIdTextFieldChanged()
{
    const gameIdField = $("#WelcomeScreen #GameID");
    const joinGameButton = $("#JoinGameButton");

    gameIdField.val(gameIdField.val().toUpperCase());
    if (gameIdField.val().length == 4)
    {
        // Join button becomes selectable when we have 4 characters
        joinGameButton.removeClass("button-disabled");
        joinGameButton.off("click").click(function() { onJoinGameButtonClicked(); });
    }
    else
    {
        joinGameButton.addClass("button-disabled");
        joinGameButton.off("click");
    }
}

function initWelcomeScreen()
{
    $("#NewGameButton").off("click").click(function() { onNewGameButtonClicked(); });
    $("#JoinGameButton").addClass("button-disabled");
    $("#WelcomeScreen #GameID").val("");
    $("#WelcomeScreen #GameID").val("").off("input").on("input", function(e) { onGameIdTextFieldChanged(); });
    $(".message").each(function(index, element)
    {
        $(element).hide();
    });
    $("#WelcomeScreen").show();
}


/**************************************************************************************************
 Select Game Screen
**************************************************************************************************/

function onSelectGameState(msg)
{
    hideAllScreens();
    $("#SelectGameScreen").show();
    $("#SelectGameScreen #GameID").val(msg.sessionId);
}

/**************************************************************************************************
 State Handling
**************************************************************************************************/

function handleMessageFromServer(msg)
{
    if (msg instanceof GameStartingStateMessage)
    {
        onGameStartingState(msg);
    }
    else if (msg instanceof FailedToJoinMessage)
    {
        onFailedToJoinState();
    }
    else if (msg instanceof SelectGameStateMessage)
    {
        onSelectGameState(msg);
    }
}


/**************************************************************************************************
 Entry Point
**************************************************************************************************/

function main()
{
    console.log("Laughprop loaded");
    hideAllScreens();
    connectToBackend();
    initWelcomeScreen();
}

export { main };