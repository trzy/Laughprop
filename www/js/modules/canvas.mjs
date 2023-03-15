/*
 * www/js/modules/canvas.mjs
 * Bart Trzynadlowski, 2023
 *
 * Canvas control.
 */

class Canvas
{
    _canvas;
    _ctx;
    _isMouseDown = false;

    _onMouseMove(event)
    {
        if (!this._isMouseDown)
        {
            return;
        }

        let elementX = event.offsetX;
        let elementY = event.offsetY;
        let elementWidth = parseInt(getComputedStyle(this._canvas).width);
        let elementHeight = parseInt(getComputedStyle(this._canvas).height);
        let canvasWidth = this._canvas.width;
        let canvasHeight = this._canvas.height;
        let x = elementX * (canvasWidth / elementWidth);
        let y = elementY * (canvasHeight / elementHeight);

        console.log(x, y, elementX, elementY);

        this._ctx.fillStyle = "#000";
        this._ctx.beginPath();
        this._ctx.arc(x, y, 2, 0, 2 * Math.PI);
        this._ctx.fill();
    }

    _onMouseOut(event)
    {
        this._isMouseDown = false;
    }

    _onMouseDown(event)
    {
        this._isMouseDown = true;
    }

    _onMouseUp(event)
    {
        this._isMouseDown = false;
    }

    _onTouchStart(event)
    {
        this._isMouseDown = true;
    }

    _onTouchEnd(event)
    {
        this._isMouseDown = false;
    }

    _onTouchMove(event)
    {
        $("#Debug").text("got here " + event.targetTouches);

        let touch = event.touches[0];
        let rect = this._canvas.getBoundingClientRect();
        let x = touch.pageX - rect.left;
        let y = touch.pageY - rect.top;

        $("#Debug").text(touch.pageX + "," + touch.pageY);

        this._onMouseMove({ offsetX: x, offsetY: y });
    }

    constructor()
    {
        let self = this;

        // This stupid dance is necessary because touch events cannot be handled by jQuery (the events fire but event objects are
        // missing the touches[] array) and because there isn't an easy way to remove listeners that are anonymous functions. So,
        // the recommended advice is to clone the node (which does *not* carry over event listeners added with addEventListener())
        // and replace the old node.
        var oldCanvas = document.getElementById("Canvas");
        this._canvas = oldCanvas.cloneNode();
        oldCanvas.parentNode.replaceChild(this._canvas, oldCanvas);
        oldCanvas.remove();
        this._ctx = this._canvas.getContext("2d");

        // Mouse events work with jQuery
        $(this._canvas).off("mousedown").mousedown((event) => self._onMouseDown(event));
        $(this._canvas).off("mouseup").mouseup((event) => self._onMouseUp(event));
        $(this._canvas).off("mousemove").mousemove((event) => self._onMouseMove(event));
        $(this._canvas).off("mouseout").mouseout((event) => self._onMouseOut(event));

        // Touch events cannot be handled by jQuery
        this._canvas.addEventListener("touchstart", (event) => self._onTouchStart(event), false);
        this._canvas.addEventListener("touchend", (event) => self._onTouchEnd(event), false);
        this._canvas.addEventListener("touchmove", (event) => self._onTouchMove(event), false);

        /*
        // Test diagonal line
        this._ctx.resetTransform();
        this._ctx.fillStyle = "#000";
        this._ctx.beginPath();
        this._ctx.moveTo(0,0);
        this._ctx.lineTo(300, 300);
        this._ctx.stroke();
        */

        console.log(this._canvas.width);
        console.log(this._canvas.clientWidth);
        console.log(parseInt(getComputedStyle(this._canvas).width));
    }
}

export { Canvas }