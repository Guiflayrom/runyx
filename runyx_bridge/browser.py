"""Selenium browser launcher with extension/profile helpers."""

import os
import time
import json
import threading
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService


class BrowserSession:
    """Manage a Selenium driver session for Edge or Chrome."""
    def __init__(
        self,
        browser="chrome",
        extension_path=None,
        user_data_dir=None,
        profile_dir=None,
        chrome_binary=None,
        driver_path=None,
        driver_log_path=None,
        driver_log_level="ALL",
        use_profile_extensions=False,
        extra_args=None,
    ):
        self.browser = browser
        self.extension_path = extension_path
        self.user_data_dir = user_data_dir
        self.profile_dir = profile_dir
        self.chrome_binary = chrome_binary
        self.driver_path = driver_path
        self.driver_log_path = driver_log_path
        self.driver_log_level = driver_log_level
        self.use_profile_extensions = use_profile_extensions
        self.extra_args = extra_args or []
        self.driver = None

    def start(self):
        """Start a Selenium driver with the configured options."""
        if self.browser == "edge":
            opts = EdgeOptions()
            opts.use_chromium = True
        else:
            opts = ChromeOptions()

        # NON-HEADLESS (core do seu MVP)

        if self.chrome_binary:
            opts.binary_location = self.chrome_binary

        if self.extension_path and not self.use_profile_extensions:
            ext_path = os.path.abspath(self.extension_path)
            opts.add_argument(f"--load-extension={ext_path}")
            # ChromeDriver injects --disable-extensions by default; remove it so
            # the unpacked extension can load.
            opts.add_experimental_option(
                "excludeSwitches",
                ["disable-extensions", "enable-automation"],
            )
            opts.add_experimental_option("useAutomationExtension", False)
            opts.add_argument("--enable-extensions")

        if self.user_data_dir:
            data_dir = os.path.abspath(self.user_data_dir)
            os.makedirs(data_dir, exist_ok=True)
            opts.add_argument(f"--user-data-dir={data_dir}")
        if self.profile_dir:
            opts.add_argument(f"--profile-directory={self.profile_dir}")

        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--start-maximized")

        for a in self.extra_args:
            opts.add_argument(a)

        log_output = None
        if self.driver_log_path:
            log_dir = os.path.dirname(os.path.abspath(self.driver_log_path))
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
            log_output = self.driver_log_path

        if self.browser == "edge":
            service = EdgeService(
                executable_path=self.driver_path,
                log_output=log_output,
            )
        else:
            service = ChromeService(
                executable_path=self.driver_path,
                log_output=log_output,
            )

        if self.browser == "edge":
            self.driver = webdriver.Edge(service=service, options=opts)
        else:
            self.driver = webdriver.Chrome(service=service, options=opts)

        return self.driver

    def is_alive(self):
        """Return True when the browser session still responds."""
        if not self.driver:
            return False
        try:
            _ = self.driver.current_window_handle
            return True
        except Exception:
            return False

    def extension_loaded(self):
        """Return True when the extension is present in the profile."""
        return self.get_extension_id() is not None

    def get_extension_id(self):
        """Resolve the extension ID from the profile Secure Preferences."""
        if not self.user_data_dir or not self.extension_path:
            return None
        pref_path = os.path.join(
            os.path.abspath(self.user_data_dir),
            "Default",
            "Secure Preferences",
        )
        ext_path = os.path.abspath(self.extension_path)
        for _ in range(20):
            if os.path.exists(pref_path):
                try:
                    with open(pref_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    settings = data.get("extensions", {}).get("settings", {})
                    for ext_id, info in settings.items():
                        path = info.get("path")
                        if path and os.path.abspath(path) == ext_path:
                            return ext_id
                    return None
                except Exception:
                    return None
            time.sleep(0.1)
        return None

    def stop(self, timeout=3):
        """Quit the Selenium driver if it is running."""
        if not self.driver:
            return
        driver = self.driver
        self.driver = None

        def _quit():
            try:
                driver.quit()
            except Exception:
                pass

        t = threading.Thread(target=_quit, daemon=True)
        t.start()
        t.join(timeout)
        if t.is_alive():
            try:
                service = getattr(driver, "service", None)
                proc = getattr(service, "process", None)
                if proc:
                    proc.kill()
            except Exception:
                pass
