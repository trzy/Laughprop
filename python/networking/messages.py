#
# python/networking/messages.py
# Bart Trzynadlowski
#
# Definition of messages for communication between processes.
#

from dataclasses import dataclass
from typing import List


@dataclass
class HelloMessage:
    message: str

@dataclass
class ClientIDMessage:
    client_id: str

@dataclass
class StartNewGameMessage:
    game_id: str

@dataclass
class JoinGameMessage:
    game_id: str

@dataclass
class UnknownGameMessage:
    game_id: str

@dataclass
class ClientSnapshotMessage:
    game_id: str
    client_ids: List[str]

@dataclass
class ClientStateUpdateMessage:
    state_json: str

@dataclass
class AuthorityStateStateUpdateMessage:
    state_json: str

@dataclass
class Txt2ImgRequestMessage:
    prompt: str