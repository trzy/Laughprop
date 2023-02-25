/*
 * www/js/modules/screens/ui_screen.mjs
 * Bart Trzynadlowski, 2023
 *
 * Defines the UI screen base class that all UI screens must extend.
 */

class UIScreen
{
    get className()
    {
        return UIScreen.name;
    }

    onMessageReceived(msg)
    {
        console.log("UIScreen: Message received but not handled (make sure derived classes implement onMessageReceived method): " + msg.__id);
    }

    constructor()
    {
    }
}

export { UIScreen };