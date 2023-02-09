#
# python/web_server.py
# Bart Trzynadlowski, 2023
#
# Main module for the web server. Hosts the web site (game interface) and backend, which maintains
# game sessions and listens for connections from image clients.
#

import argparse
import asyncio
import aiohttp
from aiohttp import web

from .web.image_dispatcher import ImageDispatcherTask


###############################################################################
# Web Server
###############################################################################

async def websocket_handler(request: web.Request):
    print("WebSocket connection opened: %s" % request.remote)
    ws = web.WebSocketResponse()
    await ws.prepare(request = request)
    async for msg in ws:
        if msg.type == aiohttp.WSMsgType.TEXT:
            if msg.data == "close":
                await ws.close()
            else:
                await ws.send_str(msg.data + "/answer")
        elif msg.type == aiohttp.WSMsgType.ERROR:
            print("WebSocket connection closed with exception: %s" % ws.exception())
    print("WebSocket connection closed: %s" % request.remote)

def add_routes(app: web.Application):
    # Redirect / -> /index.html
    app.router.add_route(method = "*", path = "/", handler = lambda request: web.HTTPFound(location = "/index.html"))

    # WebSocket
    app.add_routes( [ web.get(path = "/ws", handler = websocket_handler) ])

    # Serve /* from www/*
    app.add_routes([ web.static(prefix = "/", path = "www/") ])

async def run_web_server():
    app = web.Application()
    add_routes(app = app)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner = runner, host = "localhost", port = options.port)
    await site.start()
    print("Serving web site on http://127.0.0.1:%d..." % options.port)
    await asyncio.Event().wait()    # wait forever


###############################################################################
# Program Entry Point
###############################################################################

if __name__ == "__main__":
    parser = argparse.ArgumentParser("web_server")
    parser.add_argument("--port", metavar = "port", type = int, action = "store", default = 8080, help = "Port to run web server on")
    parser.add_argument("--image-port", metavar = "port", type = int, action = "store", default = 6503, help = "Listen for image clients on specified port")
    options = parser.parse_args()

    loop = asyncio.new_event_loop()
    tasks = []
    worker_task = ImageDispatcherTask(port = options.image_port)
    tasks.append(loop.create_task(run_web_server()))
    tasks.append(loop.create_task(worker_task.run()))
    try:
        loop.run_until_complete(asyncio.gather(*tasks))
    except KeyboardInterrupt:
        pass
    loop.close()