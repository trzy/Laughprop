#
# python/image_client.py
# Bart Trzynadlowski, 2023
#
# Main module for the image client. Image clients connect to a specified server
# and accept image generation requests over a TCP socket.
#

import argparse
import asyncio
import imageio
import platform
from PIL import Image
import os
from pathlib import Path
from queue import Queue
from queue import Empty
import signal
from threading import Thread
from threading import Event

from .image_generation import depth2img
from .image_generation import txt2img

from .networking.tcp import Session
from .networking.tcp import Client
from .networking.message_handling import handler
from .networking.message_handling import MessageHandler
from .networking.messages import *


###############################################################################
# Image Handling Helpers
###############################################################################

def load_image(url) -> Image:
    data = imageio.imread(url, pilmode = "RGB")
    return Image.fromarray(data, mode = "RGB")


def get_next_output_series_number() -> int:
    """
    Returns
    -------
    int
        Next number to label image filenames with. Filenames should have the format out-n-*.png,
        where n is the series number that this function returns.
    """
    series_labels = [ os.path.basename(path).split("-")[1] for path in Path(options.output_dir).glob("out-*-*.png") ]
    series_numbers = []
    for label in series_labels:
        try:
            number = int(label)
            series_numbers.append(number)
        except:
            pass
    return 0 if len(series_numbers) == 0 else (max(series_numbers) + 1)


###############################################################################
# Worker Thread
#
# Image generation happens in this thread.
###############################################################################

class WorkerThread(Thread):
    def __init__(self, queue: Queue):
        super().__init__()
        self._queue = queue
        self._run_event = Event()
        self._run_event.set()       # thread will run until this is cleared

    def stop(self):
        """
        Signals the thread to stop running and waits until complete. Call this from main thread.
        """
        self._run_event.clear()
        self.join()

    def run(self):
        print("Started worker thread")
        model, sampler = txt2img.initialize_model(sampler = "ddim", config = "python/stablediffusion/configs/stable-diffusion/v2-inference-v.yaml", ckpt = "sd_checkpoints/v2-1_768-ema-pruned.ckpt")
        while self._run_event.is_set():
            prompt = self._try_get_work_item()
            if prompt is None:
                continue
            print("Processing txt2img prompt: %s" % prompt)
            try:
                self._generate_image_from_prompt(model = model, sampler = sampler, prompt = prompt, negative_prompt = None)
            except Exception as e:
                print("Error: %s" % e)
        print("Finished worker thread")

    def _try_get_work_item(self):
        item = None
        try:
            item = self._queue.get(block = False, timeout = 0.1)
        except Empty:
            pass
        return item

    def _generate_image_from_prompt(self, model, sampler, prompt, negative_prompt):
        series_number = get_next_output_series_number()
        results = txt2img.predict(
            model = model,
            sampler = sampler,
            prompt = prompt,
            negative_prompt = negative_prompt,
            steps = 50,
            batch_size = 3,
            num_samples = 3,
            scale = 9,
            seed = 42,
            eta = 0
        )
        for i in range(len(results)):
            output_filepath = os.path.join(options.output_dir, "out-%d-txt2img-%d.png" % (series_number, i))
            results[i].save(output_filepath)
            print("Wrote output image: %s" % output_filepath)


###############################################################################
# Client
#
# Continuously connects to a server and listens for requests.
###############################################################################

class ClientTask(MessageHandler):
    def __init__(self, endpoint: str, queue: Queue):
        super().__init__()
        self._endpoint = endpoint
        self._reconnect_delay_seconds = 5
        self._queue = queue

    async def run(self):
        client = Client(connect_to = self._endpoint, message_handler = self)
        while True:
            await client.run()
            print("Reconnecting in %d seconds..." % self._reconnect_delay_seconds)
            await asyncio.sleep(delay = self._reconnect_delay_seconds)

    async def on_connect(self, session: Session):
        print("Connected to: %s" % session.remote_endpoint)
        await session.send(HelloMessage(message = "Hello from SDGame image client running on %s %s" % (platform.system(), platform.release())))

    async def on_disconnect(self, session: Session):
        print("Disconnected from: %s" % session.remote_endpoint)

    @handler(HelloMessage)
    async def handle_HelloMessage(self, session: Session, msg: HelloMessage, timestamp: float):
        print("Hello received: %s" % msg.message)

    @handler(Txt2ImgRequestMessage)
    async def handle_Txt2ImgRequestMessage(self, session: Session, msg: Txt2ImgRequestMessage, timestamp: float):
        #TODO: https://docs.python.org/3/library/weakref.html indicates checking liveness of weakrefs is threadsafe, so we should pass session weakrefs, too
        self._queue.put(item = msg.prompt, block = True)

def run_client():
    # Concurrent queue for communication between asyncio client session and worker thread
    queue = Queue(maxsize = 128)

    # Start worker thread
    worker_thread = WorkerThread(queue = queue)
    worker_thread.start()

    # Client connection loop
    loop = asyncio.new_event_loop()
    tasks = []
    client_loop = ClientTask(endpoint = options.endpoint, queue = queue)
    tasks.append(loop.create_task(client_loop.run()))

    # Run until Ctrl-C (KeyboardInterrupt) or some other exception
    try:
        loop.run_until_complete(asyncio.gather(*tasks))
    except KeyboardInterrupt:
        print("Terminating...")
    except Exception:
        raise
    finally:
        worker_thread.stop()
        # No idea how to gracefully halt asyncio loop. I give up!
        loop.stop()
        loop.close()


###############################################################################
# Command Line Modes
#
# These modes handle a single prompt from the command line and are intended
# to be used for debugging.
###############################################################################

def run_txt2img():
    assert options.prompt is not None, "--prompt required for depth2img mode"
    series_number = get_next_output_series_number()
    model, sampler = txt2img.initialize_model(sampler = "ddim", config = "python/stablediffusion/configs/stable-diffusion/v2-inference-v.yaml", ckpt = "sd_checkpoints/v2-1_768-ema-pruned.ckpt")
    results = txt2img.predict(
        model = model,
        sampler = sampler,
        prompt = options.prompt,
        negative_prompt = options.negative_prompt,
        steps = 50,
        batch_size = 3,
        num_samples = 3,
        scale = 9,
        seed = 42,
        eta = 0
    )
    for i in range(len(results)):
        output_filepath = os.path.join(options.output_dir, "out-%d-txt2img-%d.png" % (series_number, i))
        results[i].save(output_filepath)
        print("Wrote output image: %s" % output_filepath)

def run_depth2img():
    assert options.prompt is not None, "--prompt required for depth2img mode"
    assert options.negative_prompt is None, "--negative-prompt not yet supported in depth2img mode"
    assert options.input_image is not None, "--input-image required for depth2img mode"
    series_number = get_next_output_series_number()
    rgb_image = load_image(url = options.input_image)
    depth_sampler = depth2img.initialize_model(config = "python/stablediffusion/configs/stable-diffusion/v2-midas-inference.yaml", ckpt = "sd_checkpoints/512-depth-ema.ckpt")
    results = depth2img.predict(
        sampler = depth_sampler,
        input_image = rgb_image,
        input_depth = None,
        prompt = options.prompt,
        steps = 50,
        num_samples = 3*3,
        scale = 9,
        seed = 585501288,
        eta = 0,
        strength = 0.9
    )
    num_samples = len(results) - 1
    for i in range(num_samples):
      output_filepath = os.path.join(options.output_dir, "out-%d-depth2img-%d.png" % (series_number, i))
      results[1 + i].save(output_filepath)
      print("Wrote output image: %s" % output_filepath)


###############################################################################
# Program Entry Point
###############################################################################

if __name__ == "__main__":
    parser = argparse.ArgumentParser("image_client")
    parser.add_argument("--mode", metavar = "mode", type = str, action = "store", default = "client", help = "Mode to run in ('client', 'depth2img', 'txt2img')")
    parser.add_argument("--endpoint", metavar = "endpoint", type = str, action = "store", default = "localhost:6503", help = "Endpoint to connect to in 'client' mode")
    parser.add_argument("--prompt", metavar = "text", type = str, action = "store", help = "Prompt to use for command line image generation modes")
    parser.add_argument("--negative-prompt", metavar = "text", type = str, action = "store", help = "Negative prompt to use for command line image generation modes")
    parser.add_argument("--input-image", metavar = "filepath", type = str, action = "store", help = "Input image for modes that require it")
    parser.add_argument("--output-dir", metavar = "path", type = str, action = "store", default = "output", help = "Output directory to write generated images to")
    options = parser.parse_args()

    try:
        if options.mode == "client":
            run_client()
        elif options.mode == "depth2img":
            run_depth2img()
        elif options.mode == "txt2img":
            run_txt2img()
        else:
            raise RuntimeError("Unknown mode: %s" % options.mode)
        print("Program exited normally ")
    except Exception as e:
        print("Program died unexpectedly due to an unhandled exception: " + str(e))