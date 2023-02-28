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
class AuthoritativeStateMessage:
    screen: str
    state_json: str

@dataclass
class PeerStateMessage:
    from_client_id: str
    screen: str
    state_json: str

@dataclass
class Txt2ImgRequestMessage:
    prompt: str
    request_id: str

@dataclass
class ImageResponseMessage:
    request_id: str
    images: List[str]

@dataclass
class RequestCachedImagesMessage:
    request_ids: List[str]
    idxs: List[int]

@dataclass
class CachedImagesMessage:
    client_ids: List[str]
    request_ids: List[str]
    idxs: List[int]
    images: List[str]
