"""Extension activation helpers for Selenium-driven browsers."""

import time
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys


class ExtensionActivator:
    """Send the activation hotkey and optionally open the UI directly."""
    def __init__(self, retries=3, delay=0.3):
        self.retries = retries
        self.delay = delay

    def activate(self, driver, extension_id=None, browser="chrome", send_hotkey=True):
        """Trigger the extension UI via hotkey and/or direct URL."""
        if send_hotkey:
            for _ in range(self.retries):
                try:
                    driver.switch_to.window(driver.current_window_handle)
                    actions = ActionChains(driver)
                    actions.key_down(Keys.CONTROL).key_down(Keys.SHIFT).send_keys("f").key_up(Keys.SHIFT).key_up(Keys.CONTROL).perform()
                    break
                except Exception:
                    time.sleep(self.delay)

        if not extension_id:
            return False

        # fallback: abre o UI diretamente
        schemes = ["chrome-extension"]
        if browser == "edge":
            schemes = ["edge-extension", "chrome-extension"]
        for scheme in schemes:
            try:
                driver.get(f"{scheme}://{extension_id}/ui.html")
                return True
            except Exception:
                continue
        return False
