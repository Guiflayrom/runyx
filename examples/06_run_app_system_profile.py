from runyx_bridge import RunyxApp


def main():
    app = RunyxApp(
        browser="edge",
        use_system_profile=True,
        use_profile_extensions=True,
        require_import=False,
        auto_activate=True,
        keep_alive=True,
    )
    app.start()


if __name__ == "__main__":
    main()
