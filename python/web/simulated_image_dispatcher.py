#
# python/web/simulated_image_dispatcher.py
# Bart Trzynadlowski, 2023
#
# Simulated image worker task implementation. Does not make any connections and returns mock image
# results.
#

import asyncio
import PIL
import platform
from queue import Queue
from queue import Empty
from typing import Callable

from .image_dispatcher import ImageResult


class SimulatedImageDispatcherTask:
    def __init__(self):
        super().__init__()
        self._result_queue = Queue(maxsize = 0)

        # Load image to return
        self._dummy_image = PIL.Image.open("assets/Plissken2.jpg")

    async def run(self):
        print("Starting SIMULATED image dispatcher...")
        while True:
            completed_request = self._try_get_result()
            if completed_request is not None:
                completion = completed_request[0]
                result = completed_request[1]
                await completion(result)
            await asyncio.sleep(0.1)

    def _try_get_result(self) -> ImageResult:
        item = None
        try:
            item = self._result_queue.get_nowait()
        except Empty:
            pass
        return item

    async def submit_prompt(self, prompt: str, request_id: str, completion: Callable[[ImageResult], None]):
        result = ImageResult(request_id = request_id, images = [ self._dummy_image ] * 4)
        await asyncio.sleep(5)  # simulated time delay
        self._result_queue.put(item = (completion, result))