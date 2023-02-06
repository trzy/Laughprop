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
class Txt2ImgRequestMessage:
    prompt: str