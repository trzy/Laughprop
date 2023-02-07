#
# python/web_server.py
# Bart Trzynadlowski, 2023
#
# Main module for the web server. Hosts the web site (game interface) and backend, which maintains
# game sessions and listens for connections from image clients.
#

import argparse
import asyncio
from aiohttp import web

from .web.image_dispatcher import ImageDispatcherTask


###############################################################################
# Web Server
###############################################################################

async def handler(Request):
    return web.Response(text = "Hello from SDGame's web server!")

async def run_web_server():
    runner = web.ServerRunner(web_server = web.Server(handler))
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