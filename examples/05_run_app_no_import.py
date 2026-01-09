from runyx_bridge import RunyxApp


def main():
    app = RunyxApp(
        requests=True,
        websocket=True,
        on_background=False,
        require_import=False,
        auto_activate=False,
        keep_alive=True,
    )
    app.start()


if __name__ == "__main__":
    main()
