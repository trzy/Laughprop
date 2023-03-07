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
from queue import Queue
from queue import Empty
from threading import Thread
from threading import Event
from typing import Callable
from typing import Tuple

from ..networking.tcp import Server
from ..networking.tcp import Session
from ..networking.message_handling import handler
from ..networking.message_handling import MessageHandler
from ..networking.messages import *

from .. import webuiapi


@dataclass
class ImageResult:
    failed: bool
    prompt: str
    request_id: str
    images: List[Image]


@dataclass
class ImageRequest:
    request_id: str
    prompt: str


class WebEndpoint(Thread):
    def __init__(self, endpoint: str, result_queue: Queue):
        super().__init__()
        hostname, port = self._parse_endpoint(endpoint = endpoint)
        self._endpoint = endpoint
        self._api = webuiapi.WebUIApi(host = hostname, port = port)
        self._request_queue = Queue()
        self._result_queue = result_queue
        self._run_event = Event()
        self._run_event.set()       # thread will run until this is cleared

    def submit_request(self, request: ImageRequest, completion: Callable[[ImageResult], None]):
        self._request_queue.put(item = (completion, request))

    def stop(self):
        """
        Signals the thread to stop running and waits until complete. Call this from main thread.
        """
        self._run_event.clear()
        self.join()

    def run(self):
        print("Started worker thread: %s" % self._endpoint)
        while self._run_event.is_set():
            completion, request = self._try_get_next_request()
            if completion is None or request is None:
                continue
            print("Processing txt2img prompt for request_id=%s: %s" % (request.request_id, request.prompt))
            try:
                self._txt2img(request = request, completion = completion)
            except Exception as e:
                print("Error: %s" % e)
        print("Finished worker thread")

    def _try_get_next_request(self) -> Tuple[Callable[[ImageResult], None], ImageRequest]:
        completion = None
        request = None
        try:
            completion, request = self._request_queue.get(block = False, timeout = 0.1)
        except Empty:
            pass
        return completion, request

    @staticmethod
    def _parse_endpoint(endpoint: str) -> Tuple[str,int]:
        parts = endpoint.split(":")
        if len(parts) != 2:
            raise ValueError("Endpoint must have format hostname:port: %s" % endpoint)
        hostname = parts[0]
        try:
            port = int(parts[1])
        except ValueError:
            raise ValueError("Endpoint must have format hostname:port, where port is an integer: %s" % endpoint)
        return hostname, port

    def _txt2img(self, request: ImageRequest, completion: Callable[[ImageResult], None]):
        result = None
        try:
            response = self._api.txt2img(
                prompt = request.prompt,
                negative_prompt = "",
                seed = 42,
                styles = [],
                cfg_scale = 9,  # 7?
                steps = 40,
                batch_size = 4
            )
            #                      sampler_index='DDIM',
            #                      steps=30,
            #                      enable_hr=True,
            #                      hr_scale=2,
            #                      hr_upscaler=webuiapi.HiResUpscaler.Latent,
            #                      hr_second_pass_steps=20,
            #                      hr_resize_x=1536,
            #                      hr_resize_y=1024,
            #                      denoising_strength=0.4,
            result = ImageResult(failed = False, prompt = request.prompt, request_id = request.request_id, images = response.images)
        except RuntimeError as e:
            print("Error: txt2img query to endpoint %s failed: %s" % (self._endpoint, str(e)))
            result = ImageResult(failed = True, prompt = request.prompt, request_id = request.request_id, images = [])
        self._result_queue.put(item = (completion, result))


class ImageDispatcherTask(MessageHandler):
    def __init__(self, port: int, web_endpoints: List[str]):
        super().__init__()
        assert len(web_endpoints) > 0
        self._running = True
        self._result_queue = Queue()
        self._server = Server(port = port, message_handler = self)
        #self._sessions = set()
        self._web_threads = [ WebEndpoint(endpoint = endpoint, result_queue = self._result_queue) for endpoint in web_endpoints ]
        self._next_web_idx = 0

    async def run(self):
        print("Starting image dispatcher...")
        #TODO: sessions will have to be in a separate thread so we can process queue here
        #await self._server.run()

        # Start web threads
        for web_thread in self._web_threads:
            web_thread.start()

        # Process results
        while self._running:
            await asyncio.sleep(0)
            completion, result = self._try_get_next_result()
            if completion is None or result is None:
                continue
            try:
                if result.failed:
                    # Resubmit (TODO: remember where we submitted and ensure it goes somewhere else)
                    print("Re-submitting request_id=" % result.request_id)
                    self.submit_prompt(prompt = result.prompt, request_id = result.request_id, completion = completion)
                else:
                    await completion(result)
            except Exception as e:
                print("Error: %s" % e)


    def stop(self):
        """
        Stops main loop and shuts down all threads.
        """
        self._running = False
        for web_thread in self._web_threads:
            web_thread.stop()

    def _try_get_next_result(self) -> Tuple[Callable[[ImageResult], None], ImageRequest]:
        completion = None
        request = None
        try:
            completion, request = self._result_queue.get_nowait()
        except Empty:
            pass
        return completion, request

    async def submit_prompt(self, prompt: str, request_id: str, completion: Callable[[ImageResult], None]):
        # Submit to next web endpoint
        request = ImageRequest(request_id = request_id, prompt = prompt)
        self._web_threads[self._next_web_idx % len(self._web_threads)].submit_request(
            request = request,
            completion = completion
        )

        # image_client pathway:
        # This method should submit a prompt, wait for a response, and keep track of which client
        # the request was bound for. If the worker it was submitted to disconnects before
        # responding, it should automatically re-submit!
        #raise NotImplementedError()

    async def on_connect(self, session: Session):
        print("Connection from: %s" % session.remote_endpoint)
        await session.send(HelloMessage(message = "Hello from SDGame web server running on %s %s" % (platform.system(), platform.release())))
        #self._sessions.add(session)

        # Not yet supported -- only web API for now
        raise NotImplementedError()

    async def on_disconnect(self, session: Session):
        print("Disconnected from: %s" % session.remote_endpoint)
        #TODO: re-submit any pending jobs from that session?
        self._sessions.remove(session)

    @handler(HelloMessage)
    async def handle_HelloMessage(self, session: Session, msg: HelloMessage, timestamp: float):
        print("Hello received: %s" % msg.message)
