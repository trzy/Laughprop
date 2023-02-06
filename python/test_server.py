#
# python/test_server.py
# Bart Trzynadlowski, 2023
#
# A test server that accepts image client connections and allows the user to type prompts
# interactively.
#

import argparse
import asyncio
import platform
import sys

from .networking.tcp import Server
from .networking.tcp import Session
from .networking.message_handling import handler
from .networking.message_handling import MessageHandler
from .networking.messages import *


class ServerTask(MessageHandler):
    def __init__(self, port: int):
        super().__init__()
        self._server = Server(port = port, message_handler = self)
        self._sessions = set()

    async def run(self):
        await self._server.run()

    async def send_prompt_to_all(self, prompt):
        for session in self._sessions:
           await session.send(Txt2ImgRequestMessage(prompt = prompt))

    async def on_connect(self, session: Session):
        print("Connection from: %s" % session.remote_endpoint)
        await session.send(HelloMessage(message = "Hello from SDGame test server running on %s %s" % (platform.system(), platform.release())))
        self._sessions.add(session)

    async def on_disconnect(self, session: Session):
        print("Disconnected from: %s" % session.remote_endpoint)
        self._sessions.remove(session)

    @handler(HelloMessage)
    async def handle_HelloMessage(self, session: Session, msg: HelloMessage, timestamp: float):
        print("Hello received: %s" % msg.message)


class InteractivePromptTask:
    def __init__(self, server):
        self._server = server

    async def run(self):
        while True:
            print("Enter prompt:")
            prompt = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
            await self._server.send_prompt_to_all(prompt = prompt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser("test_server")
    parser.add_argument("--port", metavar = "port", type = int, action = "store", default = 6503, help = "Run server on specified port")
    options = parser.parse_args()
    queue = asyncio.Queue()
    loop = asyncio.new_event_loop()
    tasks = []
    server = ServerTask(port = options.port)
    interactive = InteractivePromptTask(server = server)
    tasks.append(loop.create_task(server.run()))
    tasks.append(loop.create_task(interactive.run()))
    loop.run_until_complete(asyncio.gather(*tasks))