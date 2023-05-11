/*
 * canvas.mjs
 * Bart Trzynadlowski, 2023
 *
 * Line drawing canvas widget.
 */

class Canvas
{
    _canvas;
    _ctx;
    _isMouseDown = false;
    _lastDrawnPosition = null;  // if not null, draw a line to connect else draw an arc

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

        // New point
        this._ctx.fillStyle = "#000";
        this._ctx.beginPath();
        this._ctx.arc(x, y, 2, 0, 2 * Math.PI);
        this._ctx.fill();

        // Connect line
        if (this._lastDrawnPosition != null)
        {
            let x0 = this._lastDrawnPosition[0];
            let y0 = this._lastDrawnPosition[1];
            this._ctx.fillStyle = "#000";
            this._ctx.lineWidth = 4;
            this._ctx.lineJoin = "round";
            this._ctx.beginPath();
            this._ctx.moveTo(x0, y0);
            this._ctx.lineTo(x, y);
            this._ctx.stroke();
        }

        this._lastDrawnPosition = [ x, y ];
    }

    _onMouseOut(event)
    {
        this._isMouseDown = false;
        this._lastDrawnPosition = null;
    }

    _onMouseDown(event)
    {
        this._isMouseDown = true;
        this._lastDrawnPosition = null;
    }

    _onMouseUp(event)
    {
        this._isMouseDown = false;
        this._lastDrawnPosition = null;
    }

    _onTouchStart(event)
    {
        this._isMouseDown = true;
        this._lastDrawnPosition = null;
    }

    _onTouchEnd(event)
    {
        this._isMouseDown = false;
        this._lastDrawnPosition = null;
    }

    _onTouchMove(event)
    {
        let touch = event.touches[0];
        let rect = this._canvas.getBoundingClientRect();
        let x = touch.pageX - rect.left;
        let y = touch.pageY - rect.top;

        console.log($`Touch Move: pageX=${touch.pageX}, pageY=${touch.pageY}`);

        this._onMouseMove({ offsetX: x, offsetY: y });
    }

    clear()
    {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    invertColors()
    {
        // Get the pixel data for the entire canvas
        var imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
        var data = imageData.data;

        // Loop through each pixel and invert its color
        for (var i = 0; i < data.length; i += 4) {
          // Invert the red, green, and blue components of the pixel
          data[i] = 255 - data[i];         // red
          data[i + 1] = 255 - data[i + 1]; // green
          data[i + 2] = 255 - data[i + 2]; // blue
          // Leave the alpha component unchanged
        }

        // Put the modified pixel data back onto the canvas
        this._ctx.putImageData(imageData, 0, 0);
    }

    getBase64ImageData()
    {
        // toDataURL() returns a base64-encoded image with header that must be stripped out
        return this._canvas.toDataURL("image/png").replace("data:image/png;base64,", "");
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

        // Clear canvas for drawing
        this.clear();

        // Mouse events
        this._canvas.addEventListener("mousedown", (event) => self._onMouseDown(event));
        this._canvas.addEventListener("mouseup", (event) => self._onMouseUp(event));
        this._canvas.addEventListener("mousemove", (event) => self._onMouseMove(event));
        this._canvas.addEventListener("mouseout", (event) => self._onMouseOut(event));

        // Touch events (for phones)
        this._canvas.addEventListener("touchstart", (event) => self._onTouchStart(event), false);
        this._canvas.addEventListener("touchend", (event) => self._onTouchEnd(event), false);
        this._canvas.addEventListener("touchmove", (event) => self._onTouchMove(event), false);

        console.log(`Canvas width=${this._canvas.width}, clientWidth=${this._canvas.clientWidth}, computed width=${parseInt(getComputedStyle(this._canvas).width)}`);
    }
}

export { Canvas }