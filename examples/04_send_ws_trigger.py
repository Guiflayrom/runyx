from runyx_bridge import send


def main():
    send("ws://localhost:8765", "trigger-test")


if __name__ == "__main__":
    main()
