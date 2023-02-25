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
import mimetypes
import time
from typing import Tuple
import weakref

from .web.image_dispatcher import ImageDispatcherTask
from .networking.message_handling import MessageHandler
from .networking.message_handling import handler
from .networking.messages import *
from .networking.tcp import Session
from .networking.serialization import LaserTagJSONEncoder


###############################################################################
# Web Message Handling
#
# MessageHandler interface is used but there is no true concept of sessions
# or connections here. The connect/disconnect handlers are never fired and
# session in message handlers is set to the WebSocketResponse object associated
# with the message.
###############################################################################

class WebMessageHandler(MessageHandler):
    def __init__(self):
        super().__init__()
        self._ws_by_client_id = {}          # store client WebSockets
        self._client_id_by_ws = {}
        self._client_ids_by_game_id = {}    # set of client IDs indexed by game ID

    async def remove_session(self, session: web.WebSocketResponse):
        ws = weakref.ref(session)
        client_id = self._client_id_by_ws.get(ws)
        if client_id is not None:
            # Remove WebSocket <-> client ID mapping and remove from on-going games
            del self._client_id_by_ws[ws]
            if client_id in self._ws_by_client_id:
                del self._ws_by_client_id[client_id]
                print("Removed client ID: " + client_id)
            game_ids_modified = self._remove_from_games(client_id = client_id)
            self._purge_dead_games()
            await self._send_client_snapshots(game_ids = game_ids_modified)

    @handler(HelloMessage)
    async def handle_HelloMessage(self, session: web.WebSocketResponse, msg: HelloMessage, timestamp: float):
        print("Hello received from a web client: %s" % msg.message)
        response = HelloMessage(message = "Hello from web server")
        await session.send_str(LaserTagJSONEncoder().encode(response))

    @handler(ClientIDMessage)
    async def handle_ClientIDMessage(self, session: web.WebSocketResponse, msg: ClientIDMessage, timestamp: float):
        # Establish WebSocket <-> client ID mapping
        print("New client ID: " + msg.client_id)
        ws = weakref.ref(session)
        self._ws_by_client_id[msg.client_id] = ws
        self._client_id_by_ws[ws] = msg.client_id

    @handler(StartNewGameMessage)
    async def handle_StartNewGameMessage(self, session: web.WebSocketResponse, msg: StartNewGameMessage, timestamp: float):
        client_id = self._try_lookup_client_id(session = session)
        if client_id is None:
            print("Error: Ignoring StartNewGameMessage because client ID not found for session")
            return
        print("Request to start new game received. Client ID = %s, Game ID = %s." % (client_id, msg.game_id))

        # Does this game already exist?
        if self._game_exists(msg.game_id):
            print("Error: Game ID %s already exists" % msg.game_id)
            return

        # Create new game and send client snapshot
        self._client_ids_by_game_id[msg.game_id] = set([ client_id ])
        await self._send_client_snapshot(msg.game_id)

    @handler(JoinGameMessage)
    async def handle_JoinGameMessage(self, session: web.WebSocketResponse, msg: StartNewGameMessage, timestamp: float):
        client_id = self._try_lookup_client_id(session = session)
        if client_id is None:
            print("Error: Ignoring JoinGameMessage because client ID not found for session")
            return
        print("Request to join game received. Client ID = %s, Game ID = %s." % (client_id, msg.game_id))

        # Does the game exist?
        if not self._game_exists(msg.game_id):
            print("Error: Client ID %s cannot join game ID %s because that game does not exist" % (client_id, msg.game_id))
            await self._send_message(client_id = client_id, msg = UnknownGameMessage(game_id = msg.game_id))
            return

        # Is client already in a game? If so, remove it so we that a client can only be part of one
        # game at a time
        for other_game_id, client_ids in self._client_ids_by_game_id.items():
            if client_id in client_ids:
                print("Error: Client ID %s is already part of game ID %s. Removing and joining game ID %s instead." % (client_id, other_game_id, msg.game_id))
        game_ids_modified = self._remove_from_games(client_id = client_id)
        self._purge_dead_games()

        # Add to game and send client snapshot
        self._client_ids_by_game_id[msg.game_id].add(client_id)
        game_ids_modified.append(msg.game_id)
        await self._send_client_snapshots(game_ids_modified)

    @handler(AuthoritativeStateMessage)
    async def handle_AuthoritativeStateMessage(self, session: web.WebSocketResponse, msg: AuthoritativeStateMessage, timestamp: float):
        client_id = self._try_lookup_client_id(session = session)
        game_id = self._try_lookup_game_id(client_id = client_id)
        if client_id is None:
            print("Error: Ignoring AuthoritativeStateMessage because client ID not found for session")
            return
        if game_id is None:
            print("Error: Ignoring AuthoritativeStateMessage from client ID %s because it is not part of any current game" % client_id)
            return

        # If this is not the authoritative client, then discard the message
        if client_id != self._try_get_authoritative_client_id(game_id = game_id):
            return

        # Otherwise, forward the message along to everyone, including sender, which will confirm
        # the state
        # TODO: retain message and broadcast to any new clients who join the game
        for id in self._client_ids_by_game_id[game_id]:
            await self._send_message(client_id = id, msg = msg)

    def _try_lookup_client_id(self, session: web.WebSocketResponse) -> str:
        return self._client_id_by_ws[weakref.ref(session)]

    def _try_lookup_game_id(self, client_id: str) -> str:
        for game_id, client_ids in self._client_ids_by_game_id.items():
            if client_id in client_ids:
                return game_id
        return None

    def _try_get_authoritative_client_id(self, game_id: str) -> str:
        # All clients behave as though they are authority but server selects true authority. Just
        # use first client for now.
        client_ids = self._client_ids_by_game_id.get(game_id)
        if client_ids is None:
            return None
        client_ids = list(client_ids)
        client_ids.sort()
        return client_ids[0] if len(client_ids) > 0 else None

    async def _send_message(self, client_id: str, msg):
        ws = self._ws_by_client_id.get(client_id)
        if ws is None:
            return
        session = ws()
        if session is not None:
            await session.send_str(LaserTagJSONEncoder().encode(msg))

    async def _send_client_snapshot(self, game_id: str):
        client_ids = self._client_ids_by_game_id.get(game_id)
        if client_ids is not None:
            msg = ClientSnapshotMessage(game_id = game_id, client_ids = list(client_ids))
            for client_id in client_ids:
                await self._send_message(client_id = client_id, msg = msg)

    def _remove_from_games(self, client_id: str) -> List[str]:
        # Remove from games
        game_ids_modified = []
        for game_id, client_ids in self._client_ids_by_game_id.items():
            if client_id in client_ids:
                client_ids.remove(client_id)
                game_ids_modified.append(game_id)
        return game_ids_modified

    async def _send_client_snapshots(self, game_ids: List[str]):
        # Broadcast client snapshot if game IDs still have some clients
        for game_id in set(game_ids):
            if self._game_exists(game_id):
                await self._send_client_snapshot(game_id)

    def _purge_dead_games(self):
        self._client_ids_by_game_id = { game_id: client_ids for game_id, client_ids in self._client_ids_by_game_id.items() if len(client_ids) > 0 }

    def _game_exists(self, game_id: str):
        return game_id in self._client_ids_by_game_id


###############################################################################
# Web Server
###############################################################################

async def websocket_handler(request: web.Request):
    print("WebSocket connection opened: %s" % request.remote)
    message_handler = request.app["web_message_handler"]
    ws = web.WebSocketResponse()
    await ws.prepare(request = request)
    async for msg in ws:
        if msg.type == aiohttp.WSMsgType.TEXT:
            if msg.data == "close":
                await ws.close()
            else:
                await message_handler.handle_message(session = ws, json_string = msg.data, timestamp = time.time())
        elif msg.type == aiohttp.WSMsgType.ERROR:
            print("WebSocket connection closed with exception: %s" % ws.exception())
            await message_handler.remove_session(session = ws)
    print("WebSocket connection closed: %s" % request.remote)
    await message_handler.remove_session(session = ws)

def add_routes(app: web.Application):
    # Redirect / -> /index.html
    app.router.add_route(method = "*", path = "/", handler = lambda request: web.HTTPFound(location = "/index.html"))

    # WebSocket
    app.add_routes( [ web.get(path = "/ws", handler = websocket_handler) ])

    # Serve /* from www/*
    mimetypes.init()
    mimetypes.types_map[".js"] = "application/javascript"   # send JavaScript with correct MIME type or some browsers will ignore
    mimetypes.types_map[".mjs"] = "application/javascript"
    app.add_routes([ web.static(prefix = "/", path = "www/") ])

async def run_web_server(app: web.Application):
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
    app = web.Application()
    app["web_message_handler"] = WebMessageHandler()
    worker_task = ImageDispatcherTask(port = options.image_port)
    tasks.append(loop.create_task(run_web_server(app = app)))
    tasks.append(loop.create_task(worker_task.run()))
    try:
        loop.run_until_complete(asyncio.gather(*tasks))
    except KeyboardInterrupt:
        pass
    loop.close()