#
# python/web/image_dispatcher.py
# Bart Trzynadlowski, 2023
#
# Image worker task implementation. Runs a TCP server that listens to connections from image
# clients and dispatches work requests to them.
#

import asyncio
from dataclasses import dataclass
from PIL.Image import Image
import platform
from typing import Callable

from ..networking.tcp import Server
from ..networking.tcp import Session
from ..networking.message_handling import handler
from ..networking.message_handling import MessageHandler
from ..networking.messages import *


@dataclass
class ImageResult:
    request_id: str
    images: List[Image]


class ImageDispatcherTask(MessageHandler):
    def __init__(self, port: int):
        super().__init__()
        self._server = Server(port = port, message_handler = self)
        self._sessions = set()

    async def run(self):
        print("Starting image dispatcher...")
        await self._server.run()

    async def submit_prompt(self, prompt: str, request_id: str, completion: Callable[[ImageResult], None]):
        # This method should submit a prompt, wait for a response, and keep track of which client
        # the request was bound for. If the worker it was submitted to disconnects before
        # responding, it should automatically re-submit!
        raise NotImplementedError()

    async def on_connect(self, session: Session):
        print("Connection from: %s" % session.remote_endpoint)
        await session.send(HelloMessage(message = "Hello from SDGame web server running on %s %s" % (platform.system(), platform.release())))
        self._sessions.add(session)

    async def on_disconnect(self, session: Session):
        print("Disconnected from: %s" % session.remote_endpoint)
        #TODO: re-submit any pending jobs from that session?
        self._sessions.remove(session)

    @handler(HelloMessage)
    async def handle_HelloMessage(self, session: Session, msg: HelloMessage, timestamp: float):
        print("Hello received: %s" % msg.message)
