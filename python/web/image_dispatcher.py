#
# python/web/image_dispatcher.py
# Bart Trzynadlowski, 2023
#
# Image worker task implementation. Runs a TCP server that listens to connections from image
# clients and dispatches work requests to them.
#

import asyncio
from dataclasses import dataclass
from enum import Enum
from PIL.Image import Image
import platform
from queue import Queue
from queue import Empty
from threading import Thread
from threading import Event
import time
from typing import Callable
from typing import Tuple

from ..networking.tcp import Server
from ..networking.tcp import Session
from ..networking.message_handling import handler
from ..networking.message_handling import MessageHandler
from ..networking.messages import *

from .. import webuiapi


ImageRequestType = Enum("RequestType", [ "TXT2IMG", "DEPTH2IMG" ])


@dataclass
class ImageRequest:
    request_id: str
    request_type: ImageRequestType
    prompt: str
    negative_prompt: str
    input_image: Image

@dataclass
class ImageResult:
    failed: bool
    images: List[Image]
    request: ImageRequest


class WebEndpoint(Thread):
    def __init__(self, endpoint: str, result_queue: Queue, txt2img_model_name: str, depth2img_model_name: str):
        super().__init__()
        hostname, port = self._parse_endpoint(endpoint = endpoint)
        self._endpoint = endpoint
        self._txt2img_model_name = txt2img_model_name
        self._depth2img_model_name = depth2img_model_name
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
            try:
                self._process_request(request = request, completion = completion)
            except Exception as e:
                print("Error: %s" % e)
        print("Finished worker thread")

    def _try_get_next_request(self) -> Tuple[Callable[[ImageResult], None], ImageRequest]:
        completion = None
        request = None
        try:
            completion, request = self._request_queue.get(block = True, timeout = 0.1)  # sleep so as not to spin CPU
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

    def _process_request(self, request: ImageRequest, completion: Callable[[ImageResult], None]):
        if request.request_type == ImageRequestType.TXT2IMG:
            self._txt2img(request = request, completion = completion)
        elif request.request_type == ImageRequestType.DEPTH2IMG:
            self._depth2img(request = request, completion = completion)
        else:
            print("Error: Ignoring unknown request type: %s" % str(request.request_type))


    def _txt2img(self, request: ImageRequest, completion: Callable[[ImageResult], None]):
        result = None
        try:
            # Ensure correct model is set
            if self._txt2img_model_name not in self._api.util_get_current_model():
                print("Switching to txt2img model")
                self._api.util_set_model(name = self._txt2img_model_name)

            # Generate image
            response = self._api.txt2img(
                prompt = request.prompt,
                negative_prompt = request.negative_prompt,
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
            result = ImageResult(failed = False, images = response.images, request = request)
        except RuntimeError as e:
            print("Error: txt2img query to endpoint %s failed: %s" % (self._endpoint, str(e)))
            result = ImageResult(failed = True, images = [], request = request)
        self._result_queue.put(item = (completion, result))

    def _depth2img(self, request: ImageRequest, completion: Callable[[ImageResult], None]):
        result = None
        try:
            # Ensure correct model is set
            if self._depth2img_model_name not in self._api.util_get_current_model():
                print("Switching to depth2img model")
                self._api.util_set_model(name = self._depth2img_model_name)

            # Generate image
            response = self._api.img2img(
                prompt = request.prompt,
                negative_prompt = request.negative_prompt,
                images = [ request.input_image ],
                seed = 585501288,
                cfg_scale = 9,
                denoising_strength = 0.9,
                steps = 50,
                batch_size = 1,
                n_iter = 4,             # generate 4 images sequentially, which seems to yield more diverse results (https://github.com/CompVis/stable-diffusion/issues/218)
                sampler_name = "DDIM",
                sampler_index = "DDIM", # this parameter is deprecated, supposedly
                seed_resize_from_h = 0,
                seed_resize_from_w = 0,
                resize_mode = 0
            )
            result = ImageResult(failed = False, images = response.images, request = request)
        except RuntimeError as e:
            print("Error: depth2img query to endpoint %s failed: %s" % (self._endpoint, str(e)))
            result = ImageResult(failed = True, images = [], request = request)
        self._result_queue.put(item = (completion, result))


class ImageDispatcherTask(MessageHandler):
    def __init__(self, port: int, web_endpoints: List[str], txt2img_model_name: str, depth2img_model_name: str):
        super().__init__()
        assert len(web_endpoints) > 0
        self._running = True
        self._result_queue = Queue()
        self._server = Server(port = port, message_handler = self)
        #self._sessions = set()
        self._web_threads = [ WebEndpoint(endpoint = endpoint, result_queue = self._result_queue, txt2img_model_name = txt2img_model_name, depth2img_model_name = depth2img_model_name) for endpoint in web_endpoints ]
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
            await asyncio.sleep(0.1)    # don't spin
            completion, result = self._try_get_next_result()
            if completion is None or result is None:
                continue
            try:
                if result.failed:
                    # Resubmit (TODO: remember where we submitted and ensure it goes somewhere else)
                    print("Re-submitting request_id=" % result.request_id)
                    self.submit_request(request = result.request, completion = completion)
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

    async def submit_request(self, request: ImageRequest, completion: Callable[[ImageResult], None]):
        # Submit to next web endpoint
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
