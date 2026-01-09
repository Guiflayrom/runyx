"""High-level runner that orchestrates the bridge and browser session."""

import os
import time
import json
import signal
import shutil
import tempfile
from colorama import Fore, init
from .bridge import Bridge
from .browser import BrowserSession
from .extension import ExtensionActivator

init(autoreset=True)


def _default_extension_path():
    """
    Resolve the default extension folder relative to this package, not CWD.

    Expected repo layout:
      /
      ├─ extension/
      └─ runyx_bridge/

    Default:
      ../extension (relative to runyx_bridge/)
    """
    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(here, ".."))
    return os.path.join(project_root, "extension")


class RunyxApp:
    """
    RunyxApp is the simplest "all-in-one" local runner for Runyx development.

    What it does:
      1) Starts Runyx Bridge (HTTP + WebSocket) in background processes
      2) Launches Edge or Chrome using Selenium in non-headless mode
      3) Loads the Runyx extension (unpacked folder)
      4) Imports a project JSON into the extension storage
      5) Sends Ctrl+Shift+F to activate/open the extension UI
      6) Optionally keeps the environment alive like a server

    Notes:
      - This is an MVP for development/testing (not production).
      - The hotkey activation depends on OS window focus.
      - If you prefer, you can run the Bridge standalone and open Chrome manually.
    """

    def __init__(
        self,
        browser="edge",
        extension_path=None,
        import_project_path=None,
        require_import=True,
        host="0.0.0.0",
        http_port=5001,
        ws_port=8765,
        requests=True,
        websocket=True,
        on_background=False,
        auto_activate=True,
        keep_alive=True,
        user_data_dir=None,
        profile_dir=None,
        chrome_binary=None,
        driver_path=None,
        driver_log_path=None,
        driver_log_level="ALL",
        use_system_profile=False,
        use_profile_extensions=False,
    ):
        self.browser_name = browser
        self.import_project_path = import_project_path
        self.require_import = require_import
        if extension_path is None:
            extension_path = _default_extension_path()

        self.extension_path = os.path.abspath(extension_path)
        project_root = os.path.abspath(os.path.join(self.extension_path, ".."))

        # Validate extension folder exists
        if not os.path.isdir(self.extension_path):
            msg = (
                "\n"
                + Fore.RED
                + "[RunyxApp] Extension folder not found!\n"
                + Fore.YELLOW
                + f"  Expected path: {self.extension_path}\n\n"
                + Fore.CYAN
                + "Fix options:\n"
                + Fore.GREEN
                + "  1) Ensure your repo has /extension at the project root\n"
                + "  2) Or pass extension_path explicitly:\n"
                + Fore.WHITE
                + '     RunyxApp(extension_path="C:/path/to/extension")\n'
            )
            raise FileNotFoundError(msg)

        if use_system_profile and user_data_dir is None:
            local_app_data = os.environ.get("LOCALAPPDATA")
            if local_app_data:
                if self.browser_name == "edge":
                    user_data_dir = os.path.join(local_app_data, "Microsoft", "Edge", "User Data")
                else:
                    user_data_dir = os.path.join(local_app_data, "Google", "Chrome", "User Data")
            if profile_dir is None:
                profile_dir = "Default"

        self._temp_user_data_dir = None
        if user_data_dir is None and not use_system_profile:
            user_data_dir = tempfile.mkdtemp(prefix="runyx_profile_")
            self._temp_user_data_dir = user_data_dir
        if driver_log_path is None:
            log_name = "edgedriver.log" if self.browser_name == "edge" else "chromedriver.log"
            driver_log_path = os.path.join(project_root, log_name)

        self.bridge = Bridge(
            host=host,
            http_port=http_port,
            ws_port=ws_port,
            requests=requests,
            websocket=websocket,
            on_background=True,  # bridge always runs in background inside app
        )

        self.browser = BrowserSession(
            browser=self.browser_name,
            extension_path=self.extension_path,
            user_data_dir=user_data_dir,
            profile_dir=profile_dir,
            chrome_binary=chrome_binary,
            driver_path=driver_path,
            driver_log_path=driver_log_path,
            driver_log_level=driver_log_level,
            use_profile_extensions=use_profile_extensions or use_system_profile,
        )

        self.activator = ExtensionActivator()
        self.auto_activate = auto_activate
        self.keep_alive = keep_alive
        self.on_background = on_background

        self._started = False
        self._prev_sigint = None
        self._prev_sigterm = None
        self._stopping = False

        print(Fore.CYAN + "[RunyxApp] extension path:")
        print(Fore.GREEN + f"  {self.extension_path}")
        print(Fore.CYAN + "[RunyxApp] browser:")
        print(Fore.GREEN + f"  {self.browser_name}")
        print(Fore.CYAN + "[RunyxApp] browser user data dir:")
        print(Fore.GREEN + f"  {user_data_dir}")
        print(Fore.CYAN + "[RunyxApp] driver log:")
        print(Fore.GREEN + f"  {driver_log_path}")

        if self.require_import and not self.import_project_path:
            raise FileNotFoundError(
                "[RunyxApp] import_project_path is required when require_import=True."
            )

    def _install_signal_handlers(self):
        """Ensure Ctrl+C triggers a clean shutdown."""
        def _handler(signum, frame):
            self._stopping = True
            self.stop()
            raise KeyboardInterrupt

        self._prev_sigint = signal.getsignal(signal.SIGINT)
        signal.signal(signal.SIGINT, _handler)
        if hasattr(signal, "SIGTERM"):
            self._prev_sigterm = signal.getsignal(signal.SIGTERM)
            signal.signal(signal.SIGTERM, _handler)

    def _restore_signal_handlers(self):
        """Restore the original signal handlers."""
        if self._prev_sigint is not None:
            signal.signal(signal.SIGINT, self._prev_sigint)
        if self._prev_sigterm is not None:
            signal.signal(signal.SIGTERM, self._prev_sigterm)

    def start(self):
        """Start the bridge and browser; optionally block."""
        if self._started:
            return

        self._install_signal_handlers()
        self._prepare_import_file()

        print(Fore.CYAN + "[RunyxApp] starting bridge (HTTP/WS)...")
        self.bridge.start()

        print(Fore.CYAN + "[RunyxApp] starting browser (selenium, non-headless)...")
        driver = self.browser.start()

        self._run_activation_flow(driver)

        loaded = self.browser.extension_loaded()
        if loaded is False:
            print(Fore.YELLOW + "[RunyxApp] extension not detected in profile.")
            print(Fore.YELLOW + "  Chrome may be blocking --load-extension in this build.")
            print(Fore.YELLOW + "  Try use_system_profile=True with a profile that already has Runyx installed.")

        if self.auto_activate:
            ext_id = self.browser.get_extension_id()
            if ext_id:
                self.activator.activate(driver, extension_id=ext_id, browser=self.browser_name, send_hotkey=False)

        self._started = True

        # background mode: return control to caller
        if self.on_background:
            return

        # foreground/server mode
        if self.keep_alive:
            self.run_forever()

    def run_forever(self):
        """Keep the runner alive and restart the browser if it closes."""
        print(Fore.CYAN + "[RunyxApp] running (Ctrl+C to stop)...")
        try:
            while not self._stopping:
                if not self.browser.is_alive():
                    print(Fore.YELLOW + "[RunyxApp] browser closed. restarting...")
                    driver = self.browser.start()
                    self._run_activation_flow(driver)
                    if self.auto_activate:
                        ext_id = self.browser.get_extension_id()
                        if ext_id:
                            self.activator.activate(driver, extension_id=ext_id, browser=self.browser_name, send_hotkey=False)
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        """Stop the browser and bridge processes."""
        print(Fore.CYAN + "\n[RunyxApp] stopping...")
        self._stopping = True
        try:
            self.browser.stop()
        except Exception:
            pass
        try:
            self.bridge.stop()
        except Exception:
            pass
        if self._temp_user_data_dir:
            try:
                shutil.rmtree(self._temp_user_data_dir, ignore_errors=True)
            except Exception:
                pass
        self._started = False
        self._restore_signal_handlers()

    def _prepare_import_file(self):
        """Validate and copy the project JSON into extension/local/import.json."""
        if not self.import_project_path:
            return

        src = os.path.abspath(self.import_project_path)
        if not os.path.isfile(src):
            raise FileNotFoundError(f"[RunyxApp] import JSON not found: {src}")

        data = self._validate_import_json(src)
        project = data.get("project", {})
        workflows = data.get("workflows", [])
        if not project or not workflows:
            raise ValueError("[RunyxApp] import JSON is missing project/workflows.")

        local_dir = os.path.join(self.extension_path, "local")
        os.makedirs(local_dir, exist_ok=True)
        dest = os.path.join(local_dir, "import.json")
        shutil.copyfile(src, dest)

    def _validate_import_json(self, path):
        """Basic schema validation for a project export JSON."""
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            raise ValueError(f"[RunyxApp] failed to parse import JSON: {path}") from exc

        if not isinstance(data, dict):
            raise ValueError("[RunyxApp] import JSON must be an object.")

        project = data.get("project")
        workflows = data.get("workflows")
        if not isinstance(project, dict) or not isinstance(workflows, list):
            raise ValueError("[RunyxApp] import JSON must include { project, workflows }.")

        if not isinstance(project.get("id"), str) or not project.get("id"):
            raise ValueError("[RunyxApp] import JSON project.id must be a string.")

        for wf in workflows:
            if not isinstance(wf, dict) or not isinstance(wf.get("id"), str):
                raise ValueError("[RunyxApp] each workflow must have a string id.")

        return data

    def _run_activation_flow(self, driver):
        """Wait briefly, focus the browser window, then send the activation hotkey."""
        try:
            time.sleep(1)
            self._send_hotkey(driver)
        except Exception:
            pass

    def _send_hotkey(self, driver=None):
        """Send Ctrl+Shift+F using pyautogui."""
        if not self.auto_activate:
            return
        try:
            import pyautogui
        except Exception:
            print(Fore.YELLOW + "[RunyxApp] pyautogui not available; hotkey skipped.")
            return
        try:
            if driver:
                try:
                    driver.switch_to.window(driver.current_window_handle)
                    driver.execute_script("window.focus();")
                    rect = driver.get_window_rect()
                    x = rect.get("x", 0)
                    y = rect.get("y", 0)
                    w = rect.get("width", 0)
                    h = rect.get("height", 0)
                    if w and h:
                        pyautogui.click(x + w / 2, y + h / 2)
                    time.sleep(0.2)
                except Exception:
                    pass
            pyautogui.hotkey("ctrl", "shift", "f")
        except Exception:
            pass
